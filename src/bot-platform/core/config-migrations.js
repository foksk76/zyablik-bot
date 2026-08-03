// SPDX-License-Identifier: Apache-2.0
'use strict';

// ADR-0045: версия формата конфиг-файла и миграции.
// version — служебный ключ верхнего уровня (целое, начинается с 1).
// Миграции детерминированы и идемпотентны: применяются в памяти при
// загрузке, write-back на Apply (Sprint 38). .lkg не мигрируется.

const CURRENT_VERSION = 1;

// Массив миграций: { from, to, migrate(config) }.
// Пустой, пока формат не менялся. Добавление миграции — это изменение
// CURRENT_VERSION с соответствующей записью.
const MIGRATIONS = Object.freeze([]);

function getCurrentVersion() {
    return CURRENT_VERSION;
}

// Нормализация version из файла: при отсутствии считается 1.
// Возвращает { version, error }.
function readVersion(rawConfig) {
    if (rawConfig === null || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
        return { version: 1, error: 'файл должен быть объектом JSON' };
    }

    const version = rawConfig.version;

    if (version === undefined || version === null) {
        return { version: 1, error: null };
    }

    if (!Number.isInteger(version) || version < 1) {
        return { version: 1, error: 'version должен быть целым числом >= 1' };
    }

    return { version, error: null };
}

// Проверка, что файл не новее текущей версии.
// Возвращает { ok, error }.
function checkVersionSupported(version) {
    if (version > CURRENT_VERSION) {
        return {
            ok: false,
            error: `version ${version} новее поддерживаемой (${CURRENT_VERSION}) — обновите bot-platform`
        };
    }
    return { ok: true, error: null };
}

// Пошаговая миграция файла до текущей версии. Идемпотентна: повторное
// применение к уже мигрированному файлу ничего не меняет.
// Возвращает { config, version } (новый объект, исходный не мутируется).
function migrateConfig(rawConfig, fromVersion) {
    let config = rawConfig;
    let version = fromVersion;

    while (version < CURRENT_VERSION) {
        const migration = MIGRATIONS.find((item) => item.from === version);
        if (!migration) {
            throw new Error(`Нет миграции с версии ${version} до ${CURRENT_VERSION}`);
        }
        config = migration.migrate(config);
        version = migration.to;
    }

    return { config, version };
}

// Подготовка файла к загрузке: чтение версии, проверка «не новее»,
// миграция вверх. Возвращает { config, version, error }.
function prepareConfigForLoad(rawConfig) {
    const { version, error: versionError } = readVersion(rawConfig);
    if (versionError) {
        return { config: rawConfig, version: 1, error: versionError };
    }

    const { ok, error: supportedError } = checkVersionSupported(version);
    if (!ok) {
        return { config: rawConfig, version, error: supportedError };
    }

    if (version === CURRENT_VERSION) {
        return { config: rawConfig, version, error: null };
    }

    try {
        const { config: migrated } = migrateConfig(rawConfig, version);
        return { config: migrated, version: CURRENT_VERSION, error: null };
    } catch (migrationError) {
        return { config: rawConfig, version, error: migrationError.message };
    }
}

module.exports = {
    CURRENT_VERSION,
    MIGRATIONS,
    getCurrentVersion,
    readVersion,
    checkVersionSupported,
    migrateConfig,
    prepareConfigForLoad
};
