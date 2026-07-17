const test = require('node:test');
const assert = require('node:assert/strict');

const { createCommandRegistry } = require('../../src/bot-platform/core/command-registry');

test('lookup returns handler for /help', () => {
  const registry = createCommandRegistry();
  const entry = registry.lookup('/help');

  assert.ok(entry);
  assert.equal(typeof entry.handler, 'function');
  assert.equal(entry.description, 'Show available commands');
});

test('lookup returns handler for /id', () => {
  const registry = createCommandRegistry();
  const entry = registry.lookup('/id');

  assert.ok(entry);
  assert.equal(typeof entry.handler, 'function');
  assert.equal(entry.description, 'Show recipient parameters for this chat');
});

test('lookup returns handler for /status', () => {
  const registry = createCommandRegistry();
  const entry = registry.lookup('/status');

  assert.ok(entry);
  assert.equal(typeof entry.handler, 'function');
  assert.equal(entry.description, 'Check bot status');
});

test('lookup returns null for unknown command', () => {
  const registry = createCommandRegistry();

  assert.equal(registry.lookup('/unknown'), null);
});

test('lookup returns null for null', () => {
  const registry = createCommandRegistry();

  assert.equal(registry.lookup(null), null);
});

test('lookup returns null for undefined', () => {
  const registry = createCommandRegistry();

  assert.equal(registry.lookup(undefined), null);
});

test('getCommandList returns all commands', () => {
  const registry = createCommandRegistry();
  const list = registry.getCommandList();

  assert.equal(list.length, 3);

  const help = list.find((cmd) => cmd.name === '/help');
  const id = list.find((cmd) => cmd.name === '/id');
  const status = list.find((cmd) => cmd.name === '/status');

  assert.ok(help);
  assert.equal(help.description, 'Show available commands');
  assert.ok(id);
  assert.equal(id.description, 'Show recipient parameters for this chat');
  assert.ok(status);
  assert.equal(status.description, 'Check bot status');
});

test('/help handler returns text response with command list', () => {
    const registry = createCommandRegistry();
    const response = registry.lookup('/help').handler();

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('/help'));
    assert.ok(response.text.includes('/id'));
    assert.ok(response.text.includes('/status'));
});

test('/status handler returns text response', () => {
    const registry = createCommandRegistry();
    const response = registry.lookup('/status').handler();

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('Bot is running'));
});

test('/id handler delegates to identity handler when provided', () => {
    const identityHandler = (event) => ({
        kind: 'identity',
        recipient: event.recipient,
        zabbix: { recipientType: 'user_id', to: '12345' },
        text: 'identity response'
    });
    const registry = createCommandRegistry({ identityHandler });
    const event = { recipient: { kind: 'user', value: '12345' } };
    const response = registry.lookup('/id').handler(event);

    assert.equal(response.kind, 'identity');
    assert.equal(response.zabbix.recipientType, 'user_id');
});

test('/id handler returns fallback when identity handler not provided', () => {
    const registry = createCommandRegistry();
    const event = { recipient: { kind: 'user', value: '12345' } };
    const response = registry.lookup('/id').handler(event);

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('Identity handler not available'));
});
