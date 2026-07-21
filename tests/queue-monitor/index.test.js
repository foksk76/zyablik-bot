const test = require('node:test');
const assert = require('node:assert/strict');

const { createQueueMonitor } = require('../../src/queue-monitor/index');

test('createQueueMonitor returns no-op when MONITOR_ENABLED is false', async () => {
  const monitor = createQueueMonitor({
    environment: { MONITOR_ENABLED: 'false' }
  });

  assert.equal(typeof monitor.start, 'function');
  assert.equal(typeof monitor.stop, 'function');
  assert.equal(typeof monitor.ready, 'function');
  assert.equal(monitor.ready(), true);

  await monitor.start();
  await monitor.stop();
});

test('createQueueMonitor returns no-op when MONITOR_ENABLED is not set', async () => {
  const monitor = createQueueMonitor({
    environment: {}
  });

  assert.equal(monitor.ready(), true);
});

test('createQueueMonitor with injected dependencies', async () => {
  const fakeReader = {
    ready: () => true,
    close: () => {},
    summary: () => ({ pending: 0, processing: 0, delivered: 0, failed: 0, totalAttempts: 0, total: 0 }),
    timeseries: () => [],
    topSource: () => [],
    topRecipient: () => [],
    errors: () => []
  };

  const registeredRoutes = [];
  const fakeHttpServer = {
    start: async () => {},
    stop: async () => {},
    registerRoute: (method, path) => { registeredRoutes.push({ method, path }); }
  };

  const monitor = createQueueMonitor({
    environment: { MONITOR_ENABLED: 'true', MONITOR_PORT: '19100' },
    reader: fakeReader,
    httpServer: fakeHttpServer
  });

  assert.ok(registeredRoutes.length > 0);
  assert.ok(registeredRoutes.some((r) => r.path === '/readyz'));
  assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/summary'));
  assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/discovery'));
  assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/timeseries'));
  assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/top'));
  assert.ok(registeredRoutes.some((r) => r.path === '/api/metrics/errors'));

  await monitor.start();
  await monitor.stop();
});

test('createQueueMonitor shutdown closes reader', async () => {
  let closed = false;
  const fakeReader = {
    ready: () => true,
    close: () => { closed = true; },
    summary: () => ({}),
    timeseries: () => [],
    topSource: () => [],
    topRecipient: () => [],
    errors: () => []
  };

  const fakeHttpServer = {
    start: async () => {},
    stop: async () => {},
    registerRoute: () => {}
  };

  const monitor = createQueueMonitor({
    environment: { MONITOR_ENABLED: 'true' },
    reader: fakeReader,
    httpServer: fakeHttpServer
  });

  await monitor.start();
  assert.equal(closed, false);
  await monitor.stop();
  assert.equal(closed, true);
});
