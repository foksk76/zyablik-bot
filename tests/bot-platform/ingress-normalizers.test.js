const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeIngestEvent, getNormalizer } = require('../../src/bot-platform/ingress/normalizers');

test('normalizeIngestEvent normalizes user event with source', () => {
  const event = normalizeIngestEvent({
    recipient: { kind: 'user', value: '12345' },
    message: 'Test alert'
  }, 'zabbix');

  assert.equal(event.source, 'zabbix');
  assert.equal(event.recipient.kind, 'user');
  assert.equal(event.recipient.value, '12345');
  assert.equal(event.message.text, 'Test alert');
});

test('normalizeIngestEvent normalizes chat event with source', () => {
  const event = normalizeIngestEvent({
    recipient: { kind: 'chat', value: '67890' },
    message: 'Test alert'
  }, 'siem');

  assert.equal(event.source, 'siem');
  assert.equal(event.recipient.kind, 'chat');
  assert.equal(event.recipient.value, '67890');
});

test('normalizeIngestEvent uses default source when not provided', () => {
  const event = normalizeIngestEvent({
    recipient: { kind: 'user', value: '123' },
    message: 'test'
  });

  assert.equal(event.source, 'ingest');
});

test('normalizeIngestEvent throws on missing recipient', () => {
  assert.throws(
    () => normalizeIngestEvent({ message: 'test' }, 'zabbix'),
    /Missing recipient/
  );
});

test('normalizeIngestEvent throws on missing recipient.kind', () => {
  assert.throws(
    () => normalizeIngestEvent({ recipient: { value: '123' } }, 'zabbix'),
    /Missing recipient.kind/
  );
});

test('normalizeIngestEvent throws on unsupported recipient kind', () => {
  assert.throws(
    () => normalizeIngestEvent({ recipient: { kind: 'unknown', value: '123' } }, 'zabbix'),
    /Unsupported recipient kind: unknown/
  );
});

test('normalizeIngestEvent throws on missing recipient.value', () => {
  assert.throws(
    () => normalizeIngestEvent({ recipient: { kind: 'user' } }, 'zabbix'),
    /Missing recipient.value/
  );
});

test('normalizeIngestEvent throws on invalid body', () => {
  assert.throws(
    () => normalizeIngestEvent(null, 'zabbix'),
    /Invalid event body/
  );
});

test('normalizeIngestEvent handles object message', () => {
  const event = normalizeIngestEvent({
    recipient: { kind: 'user', value: '123' },
    message: { text: 'nested message' }
  }, 'zabbix');

  assert.equal(event.message.text, '{"text":"nested message"}');
});

test('getNormalizer returns ingest normalizer for any source', () => {
  const normalizer = getNormalizer('zabbix');
  assert.equal(typeof normalizer, 'function');

  const normalizer2 = getNormalizer('siem');
  assert.equal(typeof normalizer2, 'function');

  const normalizer3 = getNormalizer('unknown');
  assert.equal(typeof normalizer3, 'function');
});
