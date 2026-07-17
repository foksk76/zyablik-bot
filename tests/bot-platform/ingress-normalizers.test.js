const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeZabbixEvent, getNormalizer } = require('../../src/bot-platform/ingress/normalizers');

test('normalizeZabbixEvent normalizes user event', () => {
  const event = normalizeZabbixEvent({
    recipient: { kind: 'user', value: '12345' },
    message: 'Test alert from Zabbix'
  });

  assert.equal(event.source, 'zabbix');
  assert.equal(event.recipient.kind, 'user');
  assert.equal(event.recipient.value, '12345');
  assert.equal(event.message.text, 'Test alert from Zabbix');
});

test('normalizeZabbixEvent normalizes chat event', () => {
  const event = normalizeZabbixEvent({
    recipient: { kind: 'chat', value: '67890' },
    message: 'Test alert from Zabbix'
  });

  assert.equal(event.source, 'zabbix');
  assert.equal(event.recipient.kind, 'chat');
  assert.equal(event.recipient.value, '67890');
});

test('normalizeZabbixEvent throws on missing recipient', () => {
  assert.throws(
    () => normalizeZabbixEvent({ message: 'test' }),
    /Missing recipient in Zabbix event/
  );
});

test('normalizeZabbixEvent throws on missing recipient.kind', () => {
  assert.throws(
    () => normalizeZabbixEvent({ recipient: { value: '123' } }),
    /Missing recipient.kind in Zabbix event/
  );
});

test('normalizeZabbixEvent throws on unsupported recipient kind', () => {
  assert.throws(
    () => normalizeZabbixEvent({ recipient: { kind: 'unknown', value: '123' } }),
    /Unsupported recipient kind: unknown/
  );
});

test('normalizeZabbixEvent throws on missing recipient.value', () => {
  assert.throws(
    () => normalizeZabbixEvent({ recipient: { kind: 'user' } }),
    /Missing recipient.value in Zabbix event/
  );
});

test('normalizeZabbixEvent throws on invalid body', () => {
  assert.throws(
    () => normalizeZabbixEvent(null),
    /Invalid Zabbix event body/
  );
});

test('normalizeZabbixEvent handles object message', () => {
  const event = normalizeZabbixEvent({
    recipient: { kind: 'user', value: '123' },
    message: { text: 'nested message' }
  });

  assert.equal(event.message.text, '{"text":"nested message"}');
});

test('getNormalizer returns zabbix normalizer', () => {
  const normalizer = getNormalizer('zabbix');
  assert.equal(typeof normalizer, 'function');
});

test('getNormalizer returns null for unknown source', () => {
  const normalizer = getNormalizer('unknown');
  assert.equal(normalizer, null);
});
