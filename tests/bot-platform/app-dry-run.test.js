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
  assert.equal(output.response.kind, 'identity');
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
  assert.equal(output.response.kind, 'identity');
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
  const calls = [];
  const result = await runMainWithEnv({
    MAX_TRANSPORT_MODE: 'long_polling'
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
