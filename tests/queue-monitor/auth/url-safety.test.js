// SPDX-License-Identifier: Apache-2.0
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isPrivateIPv4,
    isPrivateIPv6,
    assertSafeUrl
} = require('../../../src/queue-monitor/auth/url-safety');

// Mock resolver: возвращает предопределённые адреса для hostname.
function mockLookup(addressMap) {
    return async (hostname) => {
        const addrs = addressMap[hostname];
        if (!addrs) {
            const err = new Error(`ENOTFOUND ${hostname}`);
            err.code = 'ENOTFOUND';
            throw err;
        }
        return addrs.map((address) => ({ address }));
    };
}

// --- isPrivateIPv4: каждый диапазон по репрезентативному IP ---

test('isPrivateIPv4 rejects 0.0.0.0/8 (this network)', () => {
    assert.equal(isPrivateIPv4('0.0.0.0'), true);
    assert.equal(isPrivateIPv4('0.1.2.3'), true);
});

test('isPrivateIPv4 rejects 10.0.0.0/8 (private RFC1918)', () => {
    assert.equal(isPrivateIPv4('10.0.0.1'), true);
    assert.equal(isPrivateIPv4('10.255.255.255'), true);
});

test('isPrivateIPv4 rejects 127.0.0.0/8 (loopback)', () => {
    assert.equal(isPrivateIPv4('127.0.0.1'), true);
    assert.equal(isPrivateIPv4('127.255.255.255'), true);
});

test('isPrivateIPv4 rejects 169.254.0.0/16 (link-local, cloud metadata)', () => {
    assert.equal(isPrivateIPv4('169.254.169.254'), true, 'AWS/GCP metadata endpoint');
    assert.equal(isPrivateIPv4('169.254.0.1'), true);
});

test('isPrivateIPv4 rejects 172.16.0.0/12 (private RFC1918)', () => {
    assert.equal(isPrivateIPv4('172.16.0.1'), true);
    assert.equal(isPrivateIPv4('172.31.255.255'), true);
    // 172.32 — уже публичный
    assert.equal(isPrivateIPv4('172.32.0.1'), false);
    // 172.15 — публичный
    assert.equal(isPrivateIPv4('172.15.0.1'), false);
});

test('isPrivateIPv4 rejects 192.168.0.0/16 (private RFC1918)', () => {
    assert.equal(isPrivateIPv4('192.168.0.1'), true);
    assert.equal(isPrivateIPv4('192.168.1.1'), true);
});

test('isPrivateIPv4 rejects 100.64.0.0/10 (CGNAT RFC6598)', () => {
    assert.equal(isPrivateIPv4('100.64.0.1'), true);
    assert.equal(isPrivateIPv4('100.127.255.255'), true);
    assert.equal(isPrivateIPv4('100.63.255.255'), false);
    assert.equal(isPrivateIPv4('100.128.0.1'), false);
});

test('isPrivateIPv4 rejects 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved)', () => {
    assert.equal(isPrivateIPv4('224.0.0.1'), true);
    assert.equal(isPrivateIPv4('239.255.255.255'), true);
    assert.equal(isPrivateIPv4('240.0.0.1'), true);
    assert.equal(isPrivateIPv4('255.255.255.255'), true);
});

test('isPrivateIPv4 accepts public addresses', () => {
    assert.equal(isPrivateIPv4('93.184.216.34'), false, 'example.com');
    assert.equal(isPrivateIPv4('8.8.8.8'), false, 'Google DNS');
    assert.equal(isPrivateIPv4('1.1.1.1'), false, 'Cloudflare');
    assert.equal(isPrivateIPv4('172.32.0.1'), false);
});

test('isPrivateIPv4 rejects malformed IPv4', () => {
    assert.equal(isPrivateIPv4('999.1.1.1'), true);
    assert.equal(isPrivateIPv4('not-an-ip'), true);
    assert.equal(isPrivateIPv4('1.2.3'), true);
});

// --- isPrivateIPv6 ---

test('isPrivateIPv6 rejects ::1 (loopback)', () => {
    assert.equal(isPrivateIPv6('::1'), true);
});

test('isPrivateIPv6 rejects :: (unspecified)', () => {
    assert.equal(isPrivateIPv6('::'), true);
});

test('isPrivateIPv6 rejects fe80::/10 (link-local)', () => {
    assert.equal(isPrivateIPv6('fe80::1'), true);
    assert.equal(isPrivateIPv6('fe90::1'), true);
    assert.equal(isPrivateIPv6('fea0::1'), true);
    assert.equal(isPrivateIPv6('feb0::1'), true);
    assert.equal(isPrivateIPv6('fec0::1'), false, 'fec0 — outside /10');
});

test('isPrivateIPv6 rejects fc00::/7 (unique-local)', () => {
    assert.equal(isPrivateIPv6('fc00::1'), true);
    assert.equal(isPrivateIPv6('fd00::1'), true);
    assert.equal(isPrivateIPv6('fe00::1'), false);
});

test('isPrivateIPv6 rejects ff00::/8 (multicast)', () => {
    assert.equal(isPrivateIPv6('ff02::1'), true);
});

test('isPrivateIPv6 rejects IPv4-mapped (::ffff:a.b.c.d) — checks embedded IPv4', () => {
    assert.equal(isPrivateIPv6('::ffff:127.0.0.1'), true);
    assert.equal(isPrivateIPv6('::ffff:169.254.169.254'), true);
    assert.equal(isPrivateIPv6('::ffff:10.0.0.1'), true);
    assert.equal(isPrivateIPv6('::ffff:8.8.8.8'), false);
});

test('isPrivateIPv6 rejects 2001:db8::/32 (documentation)', () => {
    assert.equal(isPrivateIPv6('2001:db8::1'), true);
});

test('isPrivateIPv6 accepts public addresses', () => {
    assert.equal(isPrivateIPv6('2606:4700:4700::1111'), false, 'Cloudflare DNS');
    assert.equal(isPrivateIPv6('2001:4860:4860::8888'), false, 'Google DNS');
});

// --- assertSafeUrl ---

test('assertSafeUrl rejects non-https scheme', async () => {
    await assert.rejects(
        () => assertSafeUrl('http://idp.example.com', { dnsLookup: mockLookup({ 'idp.example.com': ['93.184.216.34'] }) }),
        /non-https scheme/
    );
    await assert.rejects(
        () => assertSafeUrl('file:///etc/passwd', { dnsLookup: mockLookup({}) }),
        /non-https scheme|invalid URL/
    );
});

test('assertSafeUrl rejects invalid URL', async () => {
    await assert.rejects(
        () => assertSafeUrl('not-a-url', { dnsLookup: mockLookup({}) }),
        /invalid URL/
    );
});

test('assertSafeUrl rejects hostname resolving to private IPv4', async () => {
    await assert.rejects(
        () => assertSafeUrl('https://internal.example.com', {
            dnsLookup: mockLookup({ 'internal.example.com': ['10.0.0.1'] })
        }),
        /private\/reserved range/
    );
});

test('assertSafeUrl rejects hostname resolving to loopback', async () => {
    await assert.rejects(
        () => assertSafeUrl('https://localhost.example', {
            dnsLookup: mockLookup({ 'localhost.example': ['127.0.0.1'] })
        }),
        /private\/reserved range/
    );
});

test('assertSafeUrl rejects cloud metadata IP (169.254.169.254)', async () => {
    await assert.rejects(
        () => assertSafeUrl('https://metadata.google.internal', {
            dnsLookup: mockLookup({ 'metadata.google.internal': ['169.254.169.254'] })
        }),
        /private\/reserved range/
    );
});

test('assertSafeUrl rejects if ANY of multiple A records is private', async () => {
    // Смешанный ответ: один публичный, один private — должно отклонить.
    await assert.rejects(
        () => assertSafeUrl('https://mixed.example', {
            dnsLookup: mockLookup({ 'mixed.example': ['93.184.216.34', '192.168.1.1'] })
        }),
        /private\/reserved range/
    );
});

test('assertSafeUrl accepts hostname resolving only to public addresses', async () => {
    await assert.doesNotReject(
        () => assertSafeUrl('https://idp.example.com', {
            dnsLookup: mockLookup({ 'idp.example.com': ['93.184.216.34', '2606:4700::1'] })
        })
    );
});

test('assertSafeUrl rejects DNS resolution failure', async () => {
    await assert.rejects(
        () => assertSafeUrl('https://nonexistent.example', { dnsLookup: mockLookup({}) }),
        /DNS resolution failed/
    );
});

test('assertSafeUrl rejects hostname resolving to no addresses', async () => {
    await assert.rejects(
        () => assertSafeUrl('https://empty.example', {
            dnsLookup: async () => []
        }),
        /resolved to no addresses/
    );
});

// --- IP literal в URL (без DNS-резолва) ---

test('assertSafeUrl rejects https://127.0.0.1 IP literal directly', async () => {
    // Должен проверить IP без DNS-вызова.
    let lookupCalled = false;
    await assert.rejects(
        () => assertSafeUrl('https://127.0.0.1/path', {
            dnsLookup: async () => { lookupCalled = true; return []; }
        }),
        /private\/reserved range/
    );
    assert.equal(lookupCalled, false, 'DNS lookup must not be called for IP literal');
});

test('assertSafeUrl rejects https://[::1] IPv6 IP literal', async () => {
    await assert.rejects(
        () => assertSafeUrl('https://[::1]/path', { dnsLookup: mockLookup({}) }),
        /private\/reserved range/
    );
});

test('assertSafeUrl accepts https://8.8.8.8 public IP literal', async () => {
    await assert.doesNotReject(
        () => assertSafeUrl('https://8.8.8.8/path', { dnsLookup: mockLookup({}) })
    );
});

// --- onDebug: resolved IP логируется только через injectable callback ---

test('assertSafeUrl calls onDebug with resolved addresses (for debug-level logging)', async () => {
    let debugInfo = null;
    await assertSafeUrl('https://idp.example.com', {
        dnsLookup: mockLookup({ 'idp.example.com': ['93.184.216.34'] }),
        onDebug: (info) => { debugInfo = info; }
    });

    assert.equal(debugInfo.hostname, 'idp.example.com');
    assert.deepEqual(debugInfo.addresses, ['93.184.216.34']);
});

test('assertSafeUrl error message contains only hostname, not resolved IP', async () => {
    // Ключевое требование: IP не должен утекать в error.message (warn/error/journal).
    // Только через onDebug.
    let caught;
    try {
        await assertSafeUrl('https://internal.example', {
            dnsLookup: mockLookup({ 'internal.example': ['10.0.0.1'] })
        });
    } catch (error) {
        caught = error.message;
    }
    assert.ok(caught.includes('internal.example'));
    assert.ok(!caught.includes('10.0.0.1'), 'resolved IP must NOT be in error message');
});
