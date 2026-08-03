#!/usr/bin/env node
'use strict';

// Импорт шаблона мониторинга Zyablik в тестовый Zabbix (Docker) через API
// и проверка созданных entities (ADR-0043).
//
// Запуск (локально, после `docker compose up -d --wait` в этой директории):
//   node docs/zabbix-template/scripts/import-and-verify.js
//
// Параметры через переменные окружения:
//   ZABBIX_API_URL          по умолчанию http://localhost:8080/api_jsonrpc.php
//   ZABBIX_API_USER         по умолчанию Admin
//   ZABBIX_API_PASSWORD     по умолчанию zabbix
//   ZYABLIK_TEMPLATE        путь к шаблону относительно этой директории/../
//                           по умолчанию zyablik-monitoring-template.yaml
//   ZABBIX_READY_TIMEOUT_MS таймаут ожидания готовности API, по умолчанию 180000
//
// Exit code: 0 при успехе, 1 при любой ошибке.

const { readFile } = require('node:fs/promises');
const path = require('node:path');

const API_URL = process.env.ZABBIX_API_URL || 'http://localhost:8080/api_jsonrpc.php';
const API_USER = process.env.ZABBIX_API_USER || 'Admin';
const API_PASSWORD = process.env.ZABBIX_API_PASSWORD || 'zabbix';
const TEMPLATE_PATH = path.resolve(
    __dirname, '..', process.env.ZYABLIK_TEMPLATE || 'zyablik-monitoring-template.yaml');

const TEMPLATE_HOST = 'Zyablik monitoring';
const EXPECTED_ITEM_KEYS = [
    'zyablik.summary',
    'zyablik.get.discovery',
    'zyablik.readyz',
    'zyablik.status.pending',
    'zyablik.status.processing',
    'zyablik.status.delivered',
    'zyablik.status.failed',
    'zyablik.status.total',
    'zyablik.status.totalAttempts',
    'zyablik.backlog',
    'zyablik.status.pending.delta',
    'zyablik.status.processing.delta',
    'zyablik.status.failed.delta',
    'zyablik.backlog.delta',
];
const EXPECTED_DISCOVERY_RULES = 1;
const EXPECTED_TRIGGERS = 4;
const EXPECTED_GRAPHS = 2;
const EXPECTED_DASHBOARDS = 1;

const POLL_INTERVAL_MS = 2000;
const READY_TIMEOUT_MS = Number(process.env.ZABBIX_READY_TIMEOUT_MS || 180000);
const REQUEST_TIMEOUT_MS = 30000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(method, params, auth) {
    const body = { jsonrpc: '2.0', method, params: params || {}, id: 1 };
    const headers = { 'Content-Type': 'application/json-rpc' };
    if (auth !== undefined) {
        // Zabbix 7.x: аутентификация через заголовок Authorization: Bearer,
        // поле `auth` в теле запроса больше не поддерживается.
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

async function verify(auth) {
    const templates = await api('template.get',
        { filter: { host: [TEMPLATE_HOST] }, output: ['host', 'templateid'] }, auth);
    if (templates.length === 0) {
        throw new Error(`Шаблон "${TEMPLATE_HOST}" не создан`);
    }
    const templateId = templates[0].templateid;
    console.log(`Шаблон "${TEMPLATE_HOST}" создан (${templateId})`);

    const items = await api('item.get',
        { hostids: [templateId], output: ['key_'] }, auth);
    const keys = new Set(items.map((item) => item.key_));
    const missing = EXPECTED_ITEM_KEYS.filter((key) => !keys.has(key));
    if (missing.length > 0) {
        throw new Error(`Не найдены items: ${missing.join(', ')}`);
    }
    console.log(`Items: ${EXPECTED_ITEM_KEYS.length} ключей присутствуют`);

    const rules = await api('discoveryrule.get',
        { hostids: [templateId], output: ['key_'] }, auth);
    if (rules.length < EXPECTED_DISCOVERY_RULES) {
        throw new Error(`Discovery rules: ожидалось >= ${EXPECTED_DISCOVERY_RULES}, найдено ${rules.length}`);
    }
    console.log(`Discovery rules: ${rules.length}`);

    const triggers = await api('trigger.get',
        { hostids: [templateId], output: ['triggerid'] }, auth);
    if (triggers.length < EXPECTED_TRIGGERS) {
        throw new Error(`Triggers: ожидалось >= ${EXPECTED_TRIGGERS}, найдено ${triggers.length}`);
    }
    console.log(`Triggers: ${triggers.length}`);

    const graphs = await api('graph.get',
        { hostids: [templateId], output: ['graphid'] }, auth);
    if (graphs.length < EXPECTED_GRAPHS) {
        throw new Error(`Graphs: ожидалось >= ${EXPECTED_GRAPHS}, найдено ${graphs.length}`);
    }
    console.log(`Graphs: ${graphs.length}`);

    const dashboards = await api('templatedashboard.get',
        { templateids: [templateId], output: ['dashboardid'] }, auth);
    if (dashboards.length < EXPECTED_DASHBOARDS) {
        throw new Error(`Dashboards: ожидалось >= ${EXPECTED_DASHBOARDS}, найдено ${dashboards.length}`);
    }
    console.log(`Dashboards: ${dashboards.length}`);
}

async function main() {
    const yaml = await readFile(TEMPLATE_PATH, 'utf8');
    console.log(`Шаблон: ${TEMPLATE_PATH} (${yaml.length} байт)`);

    await waitForApi();
    console.log(`API готов: ${API_URL}`);

    const auth = await api('user.login', { username: API_USER, password: API_PASSWORD });
    console.log(`Аутентификация: ${API_USER}`);

    try {
        await api('configuration.import', {
            format: 'yaml',
            source: yaml,
            rules: {
                templates: { createMissing: true, updateExisting: true },
                template_groups: { createMissing: true, updateExisting: true },
                templateLinkage: { createMissing: true },
                items: { createMissing: true, updateExisting: true, deleteMissing: false },
                discoveryRules: { createMissing: true, updateExisting: true, deleteMissing: false },
                triggers: { createMissing: true, updateExisting: true, deleteMissing: false },
                graphs: { createMissing: true, updateExisting: true, deleteMissing: false },
                templateDashboards: { createMissing: true, updateExisting: true },
                valueMaps: { createMissing: true, updateExisting: true },
            },
        }, auth);
        console.log('configuration.import: OK');
        await verify(auth);
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
