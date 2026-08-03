const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  loadPlugins,
  validatePlugin,
  validateConfigSchema,
  buildRouteMap,
  createPluginLoader
} = require('../../src/bot-platform/core/plugin-loader');

const pluginsDir = path.join(__dirname, '../../src/bot-platform/plugins');

test('loadPlugins returns empty array for empty directory', () => {
  const plugins = loadPlugins(path.join(__dirname, 'nonexistent-dir'));

  assert.ok(Array.isArray(plugins));
  assert.equal(plugins.length, 0);
});

test('loadPlugins discovers and loads the identity plugin', () => {
  const plugins = loadPlugins(pluginsDir);

  assert.ok(Array.isArray(plugins));
  assert.equal(plugins.length, 1);
  assert.equal(plugins[0].name, 'identity');
  assert.equal(typeof plugins[0].routes.identity, 'function');
});

test('loadPlugins skips directories without index.js', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-loader-test-'));
  const subDir = path.join(tmpDir, 'not-a-plugin');

  try {
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'some-file.js'), 'module.exports = {};');

    const plugins = loadPlugins(tmpDir);

    assert.ok(Array.isArray(plugins));
    assert.equal(plugins.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('validatePlugin throws for missing name', () => {
  assert.throws(
    () => validatePlugin({ routes: { foo: () => {} } }, 'test'),
    /must export a non-empty "name" string/
  );
});

test('validatePlugin throws for missing routes', () => {
  assert.throws(
    () => validatePlugin({ name: 'test' }, 'test'),
    /must export a "routes" object/
  );
});

test('validatePlugin throws when name does not match directory', () => {
  assert.throws(
    () => validatePlugin({ name: 'wrong', routes: { foo: () => {} } }, 'test'),
    /does not match directory name/
  );
});

test('validatePlugin throws for non-function route handler', () => {
  assert.throws(
    () => validatePlugin({ name: 'test', routes: { foo: 'not-a-function' } }, 'test'),
    /must be a function/
  );
});

test('validatePlugin throws for empty routes object', () => {
  assert.throws(
    () => validatePlugin({ name: 'test', routes: {} }, 'test'),
    /must export at least one route/
  );
});

test('validatePlugin accepts valid plugin', () => {
  const plugin = { name: 'test', routes: { foo: () => {} } };

  assert.doesNotThrow(() => validatePlugin(plugin, 'test'));
});

test('buildRouteMap merges routes from multiple plugins', () => {
  const plugins = [
    { name: 'a', routes: { routeA: () => 'a' } },
    { name: 'b', routes: { routeB: () => 'b' } }
  ];

  const routes = buildRouteMap(plugins);

  assert.equal(typeof routes.routeA, 'function');
  assert.equal(typeof routes.routeB, 'function');
  assert.equal(routes.routeA(), 'a');
  assert.equal(routes.routeB(), 'b');
});

test('buildRouteMap throws on duplicate route names', () => {
  const plugins = [
    { name: 'a', routes: { shared: () => 'a' } },
    { name: 'b', routes: { shared: () => 'b' } }
  ];

  assert.throws(
    () => buildRouteMap(plugins),
    /Duplicate route "shared"/
  );
});

test('buildRouteMap returns empty object for empty plugins array', () => {
  const routes = buildRouteMap([]);

  assert.deepEqual(routes, {});
});

test('createPluginLoader returns plugins and routes from real directory', () => {
  const result = createPluginLoader(pluginsDir);

  assert.ok(Array.isArray(result.plugins));
  assert.equal(result.plugins.length, 1);
  assert.equal(result.plugins[0].name, 'identity');
  assert.equal(typeof result.routes.identity, 'function');
});

test('createPluginLoader returns empty arrays for nonexistent directory', () => {
  const result = createPluginLoader(path.join(__dirname, 'nonexistent-dir'));

  assert.ok(Array.isArray(result.plugins));
  assert.equal(result.plugins.length, 0);
  assert.deepEqual(result.routes, {});
});

// --- configSchema (ADR-0046) ---

test('identity plugin exposes configSchema', () => {
  const plugins = loadPlugins(pluginsDir);

  assert.equal(plugins[0].name, 'identity');
  assert.deepEqual(plugins[0].configSchema, {});
});

test('validateConfigSchema accepts empty schema', () => {
  assert.doesNotThrow(() => validateConfigSchema({}, 'test'));
});

test('validateConfigSchema accepts valid field schema', () => {
  const schema = {
    retryTimeout: {
      type: 'number',
      default: 30,
      min: 1,
      max: 3600,
      required: false,
      description: 'Таймаут ретрая, секунды'
    }
  };

  assert.doesNotThrow(() => validateConfigSchema(schema, 'test'));
});

test('validateConfigSchema accepts secret and enum fields', () => {
  const schema = {
    mode: {
      type: 'enum',
      enum: ['a', 'b'],
      default: 'a'
    },
    token: {
      type: 'string',
      secret: true
    }
  };

  assert.doesNotThrow(() => validateConfigSchema(schema, 'test'));
});

test('validateConfigSchema rejects non-object schema', () => {
  assert.throws(
    () => validateConfigSchema(null, 'test'),
    /configSchema must be an object/
  );
  assert.throws(
    () => validateConfigSchema('x', 'test'),
    /configSchema must be an object/
  );
  assert.throws(
    () => validateConfigSchema([], 'test'),
    /configSchema must be an object/
  );
});

test('validateConfigSchema rejects non-object field', () => {
  assert.throws(
    () => validateConfigSchema({ foo: 'bar' }, 'test'),
    /configSchema field "foo" must be an object/
  );
});

test('validateConfigSchema rejects unknown field key', () => {
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'string', bogus: true } }, 'test'),
    /field "foo" has unknown key "bogus"/
  );
});

test('validateConfigSchema rejects invalid type', () => {
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'date' } }, 'test'),
    /has invalid type "date"/
  );
});

test('validateConfigSchema rejects empty enum', () => {
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'enum', enum: [] } }, 'test'),
    /"enum" must be a non-empty array/
  );
});

test('validateConfigSchema rejects non-number min/max', () => {
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'number', min: 'x' } }, 'test'),
    /"min" must be a number/
  );
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'number', max: 'x' } }, 'test'),
    /"max" must be a number/
  );
});

test('validateConfigSchema rejects non-boolean flags', () => {
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'string', required: 'yes' } }, 'test'),
    /"required" must be a boolean/
  );
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'string', secret: 1 } }, 'test'),
    /"secret" must be a boolean/
  );
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'string', nullable: 1 } }, 'test'),
    /"nullable" must be a boolean/
  );
});

test('validateConfigSchema rejects non-string description and section', () => {
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'string', description: 42 } }, 'test'),
    /"description" must be a string/
  );
  assert.throws(
    () => validateConfigSchema({ foo: { type: 'string', section: 42 } }, 'test'),
    /"section" must be a string/
  );
});

test('validatePlugin accepts plugin with valid configSchema', () => {
  const plugin = {
    name: 'test',
    routes: { foo: () => {} },
    configSchema: { retryTimeout: { type: 'number', default: 5 } }
  };

  assert.doesNotThrow(() => validatePlugin(plugin, 'test'));
});

test('validatePlugin rejects plugin with invalid configSchema', () => {
  const plugin = {
    name: 'test',
    routes: { foo: () => {} },
    configSchema: { retryTimeout: { type: 'date' } }
  };

  assert.throws(
    () => validatePlugin(plugin, 'test'),
    /has invalid type "date"/
  );
});

test('validatePlugin accepts plugin without configSchema', () => {
  const plugin = { name: 'test', routes: { foo: () => {} } };

  assert.doesNotThrow(() => validatePlugin(plugin, 'test'));
});
