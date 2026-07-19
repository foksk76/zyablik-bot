// SPDX-License-Identifier: Apache-2.0
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const moduleName = 'plugin-loader';

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
  buildRouteMap,
  createPluginLoader
};
