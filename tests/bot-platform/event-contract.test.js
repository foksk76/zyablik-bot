const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SOURCE_MAX,
  RECIPIENT_KIND_USER,
  RECIPIENT_KIND_CHAT,
  RECIPIENT_KINDS,
  isSupportedRecipientKind,
  createInternalEvent
} = require('../../src/bot-platform/core/event-contract');

test('event contract defines supported recipient kinds', () => {
  assert.equal(SOURCE_MAX, 'max');
  assert.equal(RECIPIENT_KIND_USER, 'user');
  assert.equal(RECIPIENT_KIND_CHAT, 'chat');
  assert.deepEqual(RECIPIENT_KINDS, ['user', 'chat']);
});

test('event contract accepts user and chat recipient kinds', () => {
  assert.equal(isSupportedRecipientKind('user'), true);
  assert.equal(isSupportedRecipientKind('chat'), true);
  assert.equal(isSupportedRecipientKind('unknown'), false);
});

test('createInternalEvent creates user event with synthetic values', () => {
  const event = createInternalEvent({
    recipient: {
      kind: 'user',
      value: '<synthetic-user-id>'
    },
    message: {
      text: 'hello'
    },
    raw: {
      kind: 'reference',
      value: '<synthetic-raw-reference>'
    }
  });

  assert.equal(event.source, 'max');
  assert.equal(event.recipient.kind, 'user');
  assert.equal(event.recipient.value, '<synthetic-user-id>');
  assert.equal(event.message.text, 'hello');
  assert.equal(event.raw.kind, 'reference');
  assert.equal(event.raw.value, '<synthetic-raw-reference>');
});

test('createInternalEvent creates chat event with synthetic values', () => {
  const event = createInternalEvent({
    recipient: {
      kind: 'chat',
      value: '<synthetic-chat-id>'
    }
  });

  assert.equal(event.source, 'max');
  assert.equal(event.recipient.kind, 'chat');
  assert.equal(event.recipient.value, '<synthetic-chat-id>');
  assert.equal(event.message.text, '');
  assert.equal(event.raw.kind, 'reference');
  assert.equal(event.raw.value, '<raw-event-reference>');
});

test('createInternalEvent rejects unsupported recipient kind', () => {
  assert.throws(
    () => createInternalEvent({ recipient: { kind: 'unsupported' } }),
    /Unsupported recipient kind/
  );
});

test('createInternalEvent throws when recipient is missing entirely', () => {
  assert.throws(
    () => createInternalEvent({}),
    /Unsupported recipient kind/
  );
});

test('createInternalEvent output has exactly {source, recipient, message, raw}', () => {
  const event = createInternalEvent({
    recipient: { kind: 'user', value: '<synthetic-user-id>' },
    message: { text: 'hello' },
    raw: { kind: 'reference', value: '<synthetic-raw>' },
    extra: 'should be ignored'
  });

  const keys = Object.keys(event);
  assert.deepEqual(keys.sort(), ['message', 'raw', 'recipient', 'source']);
  assert.equal(event.source, 'max');
  assert.equal(event.recipient.kind, 'user');
  assert.equal(event.recipient.value, '<synthetic-user-id>');
  assert.equal(event.message.text, 'hello');
  assert.equal(event.raw.kind, 'reference');
  assert.equal(event.raw.value, '<synthetic-raw>');
});
