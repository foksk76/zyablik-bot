// SPDX-License-Identifier: Apache-2.0
'use strict';

// Sprint 23 / L3: SSRF-защита для IDP_ISSUER и resolved IdP endpoints.
// Перед каждым fetchFn к IdP (discovery, token, userinfo) caller должен
// вызвать assertSafeUrl — она резолвит hostname и отклоняет любой
// private/reserved/loopback/link-local адрес.
//
// Known limitation (TOCTOU): fetch ре-резолвит DNS после этой проверки,
// поэтому короткий-TTL рекорд может rebind'нуть на internal IP между
// проверкой и соединением. Принимается как known limitation для MVP
// (см. sprint-23.md, Risks). Для full mitigation нужен pin-to-IP или
// filtering-agent — отдельный ADR при high-assurance need.
//
// Логирование: ошибка/thrown message содержит только hostname + reason.
// Resolved IP логируется только на debug-уровне через injectable onDebug
// (согласованный параметр спринта) — не попадает в warn/error/journal.

const dns = require('node:dns/promises');

const MODULE_NAME = 'queue-monitor-url-safety';

// Проверить, является ли IPv4-адрес private/reserved/loopback/link-local.
// Возвращает true, если адрес НЕ безопасен (отклонить).
function isPrivateIPv4(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
        return true; // некорректный IPv4 — считаем небезопасным
    }
    const [a, b] = parts;

    // 0.0.0.0/8 — «this network»
    if (a === 0) return true;
    // 10.0.0.0/8 — private (RFC 1918)
    if (a === 10) return true;
    // 127.0.0.0/8 — loopback
    if (a === 127) return true;
    // 169.254.0.0/16 — link-local (включая cloud metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 — private (RFC 1918)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 — IETF protocol assignments; 192.0.2.0/24 — TEST-NET-1
    if (a === 192 && b === 0) return true;
    // 192.168.0.0/16 — private (RFC 1918)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 — benchmarking; 198.51.100.0/24 — TEST-NET-2
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 100.64.0.0/10 — CGNAT (RFC 6598)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 224.0.0.0/4 — multicast
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 — reserved
    if (a >= 240) return true;

    return false;
}

// Проверить, является ли IPv6-адрес небезопасным.
// Возвращает true, если адрес НЕ безопасен (отклонить).
function isPrivateIPv6(ip) {
    const lower = ip.toLowerCase();
    if (!lower.includes(':')) {
        return true; // не IPv6
    }

    // ::1/128 — loopback
    if (lower === '::1') return true;
    // :: — unspecified
    if (lower === '::') return true;
    // fe80::/10 — link-local
    if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
        lower.startsWith('fea') || lower.startsWith('feb')) {
        return true;
    }
    // fc00::/7 — unique-local (fc.. и fd..)
    if (lower.startsWith('fc') || lower.startsWith('fd')) {
        return true;
    }
    // ff00::/8 — multicast
    if (lower.startsWith('ff')) {
        return true;
    }
    // 64:ff9b::/96 — NAT64 well-known prefix
    if (lower.startsWith('64:ff9b')) {
        return true;
    }
    // 100::/64 — discard prefix (RFC 6666)
    if (lower.startsWith('100::')) {
        return true;
    }
    // 2001:db8::/32 — documentation
    if (lower.startsWith('2001:db8')) {
        return true;
    }
    // 2001::/32 — teredo (включает 2001:0::)
    if (lower.startsWith('2001:0:') || lower.startsWith('2001::')) {
        return true;
    }

    // IPv4-mapped IPv6: ::ffff:a.b.c.d — проверить embedded IPv4
    const v4MappedMatch = lower.match(/::ffff:([0-9.]+)$/);
    if (v4MappedMatch) {
        return isPrivateIPv4(v4MappedMatch[1]);
    }
    // ::a.b.c.d — IPv4-compatible (deprecated, но проверим)
    const v4CompatMatch = lower.match(/^::([0-9.]+)$/);
    if (v4CompatMatch && !v4CompatMatch[1].startsWith('ffff')) {
        return isPrivateIPv4(v4CompatMatch[1]);
    }

    return false;
}

// Классифицировать единичный адрес (IPv4 или IPv6). true = небезопасен.
function isUnsafeAddress(address) {
    // Node dns.lookup возвращает адреса в стандартной форме.
    if (address.includes(':')) {
        return isPrivateIPv6(address);
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
        return isPrivateIPv4(address);
    }
    // Не распознали формат — считаем небезопасным (fail-closed).
    return true;
}

// Проверить, что URL безопасен для исходящего fetch.
// Бросает Error, если scheme не https ИЛИ hostname резолвится в
// private/reserved/loopback/link-local адрес.
//
// options.dnsLookup — injectable (для тестов), по умолчанию node:dns/promises.
// options.onDebug — injectable callback для логирования resolved IP
//   на debug-уровне (hostname + reason в warn/error; IP только здесь).
async function assertSafeUrl(rawUrl, options = {}) {
    const lookup = options.dnsLookup || dns.lookup;
    const onDebug = typeof options.onDebug === 'function' ? options.onDebug : null;

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new Error(`SSRF check: invalid URL`);
    }

    if (parsed.protocol !== 'https:') {
        throw new Error(`SSRF check: ${parsed.hostname} — non-https scheme (${parsed.protocol})`);
    }

    const hostname = parsed.hostname;

    // Если hostname — уже IP-литерал, проверяем напрямую без DNS.
    // IPv6 в URL пишется в скобках: [::1]; URL.hostname отдаёт без скобок.
    const isIpLiteral = /^\[?[0-9a-fA-F:.]+\]?$/.test(hostname) &&
        (hostname.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(hostname));
    if (isIpLiteral) {
        if (isUnsafeAddress(hostname.replace(/^\[|\]$/g, ''))) {
            throw new Error(`SSRF check: ${hostname} resolves to private/reserved range`);
        }
        return;
    }

    // Резолвим ВСЕ A/AAAA records. Любой private → отказ.
    let addresses;
    try {
        const result = await lookup(hostname, { all: true });
        addresses = result;
    } catch (error) {
        // DNS-ошибка — не SSRF, пробрасываем как есть (caller решает).
        throw new Error(`SSRF check: DNS resolution failed for ${hostname} (${error.message})`);
    }

    if (addresses.length === 0) {
        throw new Error(`SSRF check: ${hostname} resolved to no addresses`);
    }

    if (onDebug) {
        onDebug({ hostname, addresses: addresses.map((a) => a.address) });
    }

    for (const { address } of addresses) {
        if (isUnsafeAddress(address)) {
            // В сообщении — только hostname (минимизация info disclosure).
            // Полный список адресов доступен через onDebug.
            throw new Error(`SSRF check: ${hostname} resolves to private/reserved range`);
        }
    }
}

module.exports = {
    MODULE_NAME,
    isPrivateIPv4,
    isPrivateIPv6,
    isUnsafeAddress,
    assertSafeUrl
};
