// SPDX-License-Identifier: Apache-2.0
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const moduleName = 'plugin-loader';

// ADR-0046: допустимые ключи поля configSchema плагина и типы значений.
const CONFIG_SCHEMA_FIELD_KEYS = Object.freeze([
    'type',
    'default',
    'required',
    'secret',
    'enum',
    'min',
    'max',
    'nullable',
    'description',
    'section'
]);

const CONFIG_SCHEMA_VALUE_TYPES = new Set(['string', 'number', 'boolean', 'enum', 'list']);

function loadPlugins(pluginsDir) {
    const plugins = [];

    if (!fs.existsSync(pluginsDir)) {
        return plugins;
    }

    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }

        const pluginPath = path.join(pluginsDir, entry.name, 'index.js');

        if (!fs.existsSync(pluginPath)) {
            continue;
        }

        const plugin = require(pluginPath);

        validatePlugin(plugin, entry.name);

        plugins.push(plugin);
    }

    return plugins;
}

function validatePlugin(plugin, dirName) {
    if (!plugin || typeof plugin !== 'object') {
        throw new Error(`Plugin in "${dirName}" must export an object`);
    }

    if (typeof plugin.name !== 'string' || plugin.name.length === 0) {
        throw new Error(`Plugin in "${dirName}" must export a non-empty "name" string`);
    }

    if (plugin.name !== dirName) {
        throw new Error(
            `Plugin name "${plugin.name}" does not match directory name "${dirName}"`
        );
    }

    if (!plugin.routes || typeof plugin.routes !== 'object') {
        throw new Error(`Plugin "${plugin.name}" must export a "routes" object`);
    }

    const routeEntries = Object.entries(plugin.routes);

    if (routeEntries.length === 0) {
        throw new Error(`Plugin "${plugin.name}" must export at least one route`);
    }

    for (const [routeName, handler] of routeEntries) {
        if (typeof handler !== 'function') {
            throw new Error(
                `Plugin "${plugin.name}" route "${routeName}" must be a function`
            );
        }
    }

    // ADR-0046: configSchema опционален (плагин без схемы невидим в Settings UI).
    if (plugin.configSchema !== undefined) {
        validateConfigSchema(plugin.configSchema, plugin.name);
    }
}

// ADR-0046: валидация configSchema плагина при загрузке.
// Формат поля: { type, default, required, secret, enum, min, max, nullable,
// description, section }. Схема описывает ветку plugins.<name>.*.
function validateConfigSchema(configSchema, pluginName) {
    if (configSchema === null || typeof configSchema !== 'object' || Array.isArray(configSchema)) {
        throw new Error(
            `Plugin "${pluginName}" configSchema must be an object`
        );
    }

    for (const [key, field] of Object.entries(configSchema)) {
        if (field === null || typeof field !== 'object' || Array.isArray(field)) {
            throw new Error(
                `Plugin "${pluginName}" configSchema field "${key}" must be an object`
            );
        }

        for (const fieldKey of Object.keys(field)) {
            if (!CONFIG_SCHEMA_FIELD_KEYS.includes(fieldKey)) {
                throw new Error(
                    `Plugin "${pluginName}" configSchema field "${key}" has unknown key "${fieldKey}"`
                );
            }
        }

        if (field.type !== undefined && !CONFIG_SCHEMA_VALUE_TYPES.has(field.type)) {
            throw new Error(
                `Plugin "${pluginName}" configSchema field "${key}" has invalid type "${field.type}"`
            );
        }

        if (field.enum !== undefined && (!Array.isArray(field.enum) || field.enum.length === 0)) {
            throw new Error(
                `Plugin "${pluginName}" configSchema field "${key}" "enum" must be a non-empty array`
            );
        }

        if (field.min !== undefined && typeof field.min !== 'number') {
            throw new Error(
                `Plugin "${pluginName}" configSchema field "${key}" "min" must be a number`
            );
        }

        if (field.max !== undefined && typeof field.max !== 'number') {
            throw new Error(
                `Plugin "${pluginName}" configSchema field "${key}" "max" must be a number`
            );
        }

        for (const boolKey of ['required', 'secret', 'nullable']) {
            if (field[boolKey] !== undefined && typeof field[boolKey] !== 'boolean') {
                throw new Error(
                    `Plugin "${pluginName}" configSchema field "${key}" "${boolKey}" must be a boolean`
                );
            }
        }

        if (field.description !== undefined && typeof field.description !== 'string') {
            throw new Error(
                `Plugin "${pluginName}" configSchema field "${key}" "description" must be a string`
            );
        }

        if (field.section !== undefined && typeof field.section !== 'string') {
            throw new Error(
                `Plugin "${pluginName}" configSchema field "${key}" "section" must be a string`
            );
        }
    }
}

function buildRouteMap(plugins) {
    const routes = {};

    for (const plugin of plugins) {
        for (const [routeName, handler] of Object.entries(plugin.routes)) {
            if (routes[routeName]) {
                throw new Error(
                    `Duplicate route "${routeName}" from plugins "${routes[routeName]._plugin}" and "${plugin.name}"`
                );
            }

            routes[routeName] = handler;
            routes[routeName]._plugin = plugin.name;
        }
    }

    return routes;
}

function createPluginLoader(pluginsDir) {
    const plugins = loadPlugins(pluginsDir);
    const routes = buildRouteMap(plugins);

    return { plugins, routes };
}

module.exports = {
    moduleName,
    loadPlugins,
    validatePlugin,
    validateConfigSchema,
    buildRouteMap,
    createPluginLoader
};
