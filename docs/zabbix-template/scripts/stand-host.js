#!/usr/bin/env node
'use strict';

// Создание хоста «Zyablik bot stand» в тестовом Zabbix (Docker) через API:
// привязка шаблона «Zyablik monitoring» и host-level макросы для живого
// стенда (ADR-0043, Sprint 35).
//
// Запуск (локально, после `docker compose up -d --wait` в этой директории):
//   ZYABLIK_API_KEY=<dev-token> node docs/zabbix-template/scripts/stand-host.js
//
// Параметры через переменные окружения:
//   ZABBIX_API_URL          по умолчанию http://localhost:8080/api_jsonrpc.php
//   ZABBIX_API_USER         по умолчанию Admin
//   ZABBIX_API_PASSWORD     по умолчанию zabbix
//   ZYABLIK_API_KEY         ОБЯЗАТЕЛЬНО: dev-токен для /api/metrics/* (не в репо)
//   ZYABLIK_HOST_NAME       по умолчанию Zyablik bot stand
//   ZYABLIK_GROUP           по умолчанию Zyablik (группа хостов)
//   ZYABLIK_URL             по умолчанию http://172.23.0.1 (bridge gateway до хоста)
//   ZYABLIK_PORT            по умолчанию 9000
//   ZYABLIK_POLL_INTERVAL   по умолчанию 10 (быстрая проверка на стенде)
//   ZYABLIK_NODATA_SEC      по умолчанию 30 (3 интервала опроса стенда)
//   ZABBIX_READY_TIMEOUT_MS таймаут ожидания готовности API, по умолчанию 180000
//
// Идемпотентность: повторный запуск обновляет существующий хост
// (макросы, шаблоны, группа), не создавая дубликатов.
// Exit code: 0 при успехе, 1 при любой ошибке.

const TEMPLATE_HOST = 'Zyablik monitoring';

const API_URL = process.env.ZABBIX_API_URL || 'http://localhost:8080/api_jsonrpc.php';
const API_USER = process.env.ZABBIX_API_USER || 'Admin';
const API_PASSWORD = process.env.ZABBIX_API_PASSWORD || 'zabbix';
const API_KEY = process.env.ZYABLIK_API_KEY || '';
const HOST_NAME = process.env.ZYABLIK_HOST_NAME || 'Zyablik bot stand';
const GROUP_NAME = process.env.ZYABLIK_GROUP || 'Zyablik';
const BOT_URL = process.env.ZYABLIK_URL || 'http://172.23.0.1';
const BOT_PORT = process.env.ZYABLIK_PORT || '9000';
const POLL_INTERVAL = process.env.ZYABLIK_POLL_INTERVAL || '10';
const NODATA_SEC = process.env.ZYABLIK_NODATA_SEC || '30';

const POLL_INTERVAL_MS = 2000;
const READY_TIMEOUT_MS = Number(process.env.ZABBIX_READY_TIMEOUT_MS || 180000);
const REQUEST_TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, params, auth) {
    const body = { jsonrpc: '2.0', method, params: params || {}, id: 1 };
    const headers = { 'Content-Type': 'application/json-rpc' };
    if (auth !== undefined) {
        // Zabbix 7.x: аутентификация через заголовок Authorization: Bearer.
        headers['Authorization'] = `Bearer ${auth}`;
    }
    let res;
    try {
        res = await fetch(API_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (err) {
        const timeout = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
        throw new Error(`API ${method}: ${timeout ? `таймаут за ${REQUEST_TIMEOUT_MS} мс` : `сеть недоступна (${err.message})`}`);
    }
    const text = await res.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`API ${method}: ответ не JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
    if (json.error) {
        const detail = json.error.data ? `: ${json.error.data}` : '';
        throw new Error(`API ${method}: ${json.error.message} (код ${json.error.code})${detail}`);
    }
    return json.result;
}

async function waitForApi() {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastError;
    while (Date.now() < deadline) {
        try {
            return await api('apiinfo.version');
        } catch (err) {
            lastError = err;
            await sleep(POLL_INTERVAL_MS);
        }
    }
    throw new Error(`Zabbix API не готов за ${READY_TIMEOUT_MS} мс: ${lastError ? lastError.message : 'таймаут'}`);
}

function buildMacros() {
    return [
        { macro: '{$ZYABLIK.URL}', value: BOT_URL, description: 'Стенд: базовый URL бота' },
        { macro: '{$ZYABLIK.PORT}', value: BOT_PORT, description: 'Стенд: HTTP-порт бота' },
        { macro: '{$ZYABLIK.API_KEY}', value: API_KEY, type: 1, description: 'Стенд: dev-токен /api/metrics/*' },
        { macro: '{$ZYABLIK.POLL_INTERVAL}', value: POLL_INTERVAL, description: 'Стенд: быстрый опрос' },
        { macro: '{$ZYABLIK.NODATA_SEC}', value: NODATA_SEC, description: 'Стенд: окно nodata (3 опроса)' },
    ];
}

async function main() {
    if (!API_KEY) {
        throw new Error('Задайте ZYABLIK_API_KEY (dev-токен /api/metrics/*)');
    }

    await waitForApi();
    console.log(`API готов: ${API_URL}`);

    const auth = await api('user.login', { username: API_USER, password: API_PASSWORD });
    console.log(`Аутентификация: ${API_USER}`);

    try {
        const templates = await api('template.get',
            { filter: { host: [TEMPLATE_HOST] }, output: ['host', 'templateid'] }, auth);
        if (templates.length === 0) {
            throw new Error(`Шаблон "${TEMPLATE_HOST}" не найден — сначала импортируйте шаблон`);
        }
        const templateId = templates[0].templateid;
        console.log(`Шаблон "${TEMPLATE_HOST}" (${templateId})`);

        let groupId;
        const groups = await api('hostgroup.get', { filter: { name: [GROUP_NAME] }, output: ['groupid'] }, auth);
        if (groups.length > 0) {
            groupId = groups[0].groupid;
            console.log(`Группа "${GROUP_NAME}" существует (${groupId})`);
        } else {
            const created = await api('hostgroup.create', { name: GROUP_NAME }, auth);
            groupId = created.groupids[0];
            console.log(`Группа "${GROUP_NAME}" создана (${groupId})`);
        }

        const templatesParam = [{ templateid: templateId }];
        const groupsParam = [{ groupid: groupId }];
        const macrosParam = buildMacros();

        const existing = await api('host.get', { filter: { host: [HOST_NAME] }, output: ['hostid'] }, auth);
        let hostId;
        if (existing.length > 0) {
            hostId = existing[0].hostid;
            await api('host.update', {
                hostid: hostId,
                groups: groupsParam,
                templates: templatesParam,
                macros: macrosParam,
            }, auth);
            console.log(`Хост "${HOST_NAME}" обновлён (${hostId})`);
        } else {
            const created = await api('host.create', {
                host: HOST_NAME,
                status: 0,
                groups: groupsParam,
                templates: templatesParam,
                macros: macrosParam,
            }, auth);
            hostId = created.hostids[0];
            console.log(`Хост "${HOST_NAME}" создан (${hostId})`);
        }

        const verifyHost = await api('host.get', {
            hostids: [hostId],
            output: ['host'],
            selectParentTemplates: ['host'],
            selectMacros: ['macro', 'type'],
        }, auth);
        const h = verifyHost[0];
        const linked = h.parentTemplates.map((t) => t.host);
        if (!linked.includes(TEMPLATE_HOST)) {
            throw new Error(`Шаблон "${TEMPLATE_HOST}" не привязан к хосту`);
        }
        console.log(`Привязанные шаблоны: ${linked.join(', ')}`);

        const macroNames = h.macros.map((m) => m.macro);
        for (const macro of ['{$ZYABLIK.URL}', '{$ZYABLIK.PORT}', '{$ZYABLIK.API_KEY}', '{$ZYABLIK.POLL_INTERVAL}', '{$ZYABLIK.NODATA_SEC}']) {
            if (!macroNames.includes(macro)) {
                throw new Error(`Макрос ${macro} не найден на хосте`);
            }
        }
        const secretMacro = h.macros.find((m) => m.macro === '{$ZYABLIK.API_KEY}');
        if (String(secretMacro.type) !== '1') {
            throw new Error('Макрос {$ZYABLIK.API_KEY} не является секретным (type != 1)');
        }
        console.log(`Макросы: ${macroNames.join(', ')}; API_KEY — Secret`);
    } finally {
        try {
            await api('user.logout', [], auth);
        } catch {
            // logout — best effort
        }
    }
    console.log('ПРОВЕРКИ ПРОЙДЕНЫ');
}

main().catch((err) => {
    console.error(`ОШИБКА: ${err.message}`);
    process.exitCode = 1;
});
