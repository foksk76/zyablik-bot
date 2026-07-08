const test = require('node:test');
const assert = require('node:assert/strict');

const { createInternalEvent } = require('../../src/bot-platform/core/event-contract');
const {
  formatIdentityResponse
} = require('../../src/bot-platform/plugins/identity/formatter');

function createUserEvent() {
  return createInternalEvent({
    recipient: {
      kind: 'user',
      value: '<synthetic-user-id>'
    },
    message: {
      text: 'show my recipient id'
    },
    raw: {
      kind: 'reference',
      value: '<synthetic-message-id>'
    }
  });
}

function createChatEvent() {
  return createInternalEvent({
    recipient: {
      kind: 'chat',
      value: '<synthetic-chat-id>'
    },
    message: {
      text: 'show this chat recipient id'
    },
    raw: {
      kind: 'reference',
      value: '<synthetic-message-id>'
    }
  });
}

test('formatIdentityResponse creates Zabbix recipient hint for user event', () => {
  const response = formatIdentityResponse(createUserEvent());

  assert.equal(response.kind, 'identity');
  assert.equal(response.recipient.kind, 'user');
  assert.equal(response.zabbix.recipientType, 'user_id');
  assert.equal(response.zabbix.to, '<synthetic-user-id>');
  assert.match(response.text, /RecipientType: user_id/);
  assert.match(response.text, /To: <synthetic-user-id>/);
});

test('formatIdentityResponse creates Zabbix recipient hint for chat event', () => {
  const response = formatIdentityResponse(createChatEvent());

  assert.equal(response.kind, 'identity');
  assert.equal(response.recipient.kind, 'chat');
  assert.equal(response.zabbix.recipientType, 'chat_id');
  assert.equal(response.zabbix.to, '<synthetic-chat-id>');
  assert.match(response.text, /RecipientType: chat_id/);
  assert.match(response.text, /To: <synthetic-chat-id>/);
});

test('formatIdentityResponse does not include raw payload reference', () => {
  const response = formatIdentityResponse(createUserEvent());

  assert.doesNotMatch(response.text, /raw/i);
  assert.doesNotMatch(response.text, /<synthetic-message-id>/);
  assert.equal(response.raw, undefined);
});

test('formatIdentityResponse rejects unsupported recipient kind', () => {
  assert.throws(
    () => formatIdentityResponse({
      recipient: {
        kind: 'unsupported',
        value: '<synthetic-recipient-id>'
      },
      message: {
        text: 'hello'
      }
    }),
    /Unsupported identity recipient kind/
  );
});
