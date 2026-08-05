const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { main } = require('../../src/bot-platform/app');

async function runMain(fixtureName) {
  let stdout = '';
  let stderr = '';

  const exitCode = await main([path.join('examples/bot-platform', fixtureName)], {
    stdout: {
      write(chunk) {
        stdout += chunk;
      }
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      }
    }
  });

  return {
    exitCode,
    stdout,
    stderr
  };
}

async function runMainWithEnv(environment, argv = [], options = {}) {
  const originalEnv = process.env;
  let stdout = '';
  let stderr = '';

  process.env = { ...originalEnv, ...environment };

  try {
    const exitCode = await main(argv, {
      stdout: {
        write(chunk) {
          stdout += chunk;
        }
      },
      stderr: {
        write(chunk) {
          stderr += chunk;
        }
      }
    }, options);

    return {
      exitCode,
      stdout,
      stderr
    };
  } finally {
    process.env = originalEnv;
  }
}

test('CLI dry-run prints a safe result for the user fixture', async () => {
  const result = await runMain('max-inbound-user.fixture.json');

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, '');

  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'dry-run');
  assert.equal(output.networkEnabled, false);
  assert.equal(output.response.kind, 'text');
  assert.equal(output.response.recipient.kind, 'user');
  assert.equal(output.outbound.networkEnabled, false);
  assert.equal(output.outbound.request.body.recipientType, 'user_id');
  assert.equal(output.response.raw, undefined);
});

test('CLI dry-run prints a safe result for the chat fixture', async () => {
  const result = await runMain('max-inbound-chat.fixture.json');

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, '');

  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'dry-run');
  assert.equal(output.networkEnabled, false);
  assert.equal(output.response.kind, 'text');
  assert.equal(output.response.recipient.kind, 'chat');
  assert.equal(output.outbound.networkEnabled, false);
  assert.equal(output.outbound.request.body.recipientType, 'chat_id');
  assert.equal(output.response.raw, undefined);
});

test('CLI fails fast for webhook transport without starting network work', async () => {
  const result = await runMainWithEnv({
    MAX_TRANSPORT_MODE: 'webhook'
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Не реализовано: transport mode webhook\n');
});

test('CLI live command routes to live service entrypoint without using fixtures', async () => {
  // Изоляция от рантайм-конфига стенда (config/zyablik.config.json с $VAR-
  // секретами не валиден без окружения): тест не должен зависеть от состояния
  // стендового файла, поэтому задаём явный путь к временному конфигу.
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zyablik-live-route-'));
  const configPath = path.join(dir, 'zyablik.config.json');

  fs.writeFileSync(configPath, JSON.stringify({
    version: 1,
    bot: {
      maxTransportMode: 'long_polling'
    }
  }, null, 2), 'utf8');

  const calls = [];
  const result = await runMainWithEnv({
    MAX_TRANSPORT_MODE: 'long_polling',
    ZYABLIK_CONFIG: configPath
  }, ['--live'], {
    liveOptions: {
      installSignalHandlers: false
    },
    startLiveBotPlatformService(environment, liveOptions) {
      calls.push({
        environment,
        liveOptions
      });

      return {
        start() {
          return this;
        },
        stop() {
          return this;
        }
      };
    }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, 'MAX bot-platform live service started in long_polling mode\n');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].environment.MAX_TRANSPORT_MODE, 'long_polling');
  assert.equal(calls[0].liveOptions.installSignalHandlers, false);
  assert.ok(calls[0].liveOptions.io);
});

test('CLI live command exits with code 1 and stops services when live boot fails (M1 review)', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zyablik-live-fail-'));
  const configPath = path.join(dir, 'zyablik.config.json');

  fs.writeFileSync(configPath, JSON.stringify({
    version: 1,
    bot: {
      maxTransportMode: 'long_polling'
    }
  }, null, 2), 'utf8');

  const result = await runMainWithEnv({
    MAX_TRANSPORT_MODE: 'long_polling',
    ZYABLIK_CONFIG: configPath
  }, ['--live'], {
    liveOptions: {
      installSignalHandlers: false
    },
    startLiveBotPlatformService() {
      const error = new Error('Live MAX Identity Bot service did not start within 50ms (no successful long-polling cycle)');
      error.code = 'LIVE_FIRST_TICK_TIMEOUT';
      throw error;
    }
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /did not start within 50ms/);
});

test('CLI live command passes file-loaded config to live service (H1 review)', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const calls = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zyablik-live-config-'));
  const configPath = path.join(dir, 'zyablik.config.json');

  fs.writeFileSync(configPath, JSON.stringify({
    version: 1,
    bot: {
      maxPollLimit: 42,
      maxPollTypes: ['message_created']
    }
  }, null, 2), 'utf8');

  const result = await runMainWithEnv({
    MAX_TRANSPORT_MODE: 'long_polling',
    ZYABLIK_CONFIG: configPath
  }, ['--live'], {
    liveOptions: {
      installSignalHandlers: false
    },
    startLiveBotPlatformService(environment, liveOptions) {
      calls.push({ environment, liveOptions });
      return {
        start() {
          return this;
        },
        stop() {
          return this;
        }
      };
    }
  });

  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].liveOptions.config.maxPollLimit, 42,
    'liveOptions.config отражает значение maxPollLimit из файла');
  assert.deepEqual(calls[0].liveOptions.config.maxPollTypes, ['message_created'],
    'liveOptions.config отражает значение maxPollTypes из файла');
});
