const test = require('node:test');
const assert = require('node:assert/strict');

const { createInternalEvent } = require('../../src/bot-platform/core/event-contract');
const { createEventRouter } = require('../../src/bot-platform/core/event-router');
const { handleIdentityEvent } = require('../../src/bot-platform/plugins/identity');

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

test('event router routes user event to identity plugin', () => {
  const router = createEventRouter({
    identity: handleIdentityEvent
  });

  const response = router.route(createUserEvent(), { route: 'identity' });

  assert.equal(response.kind, 'identity');
  assert.equal(response.recipient.kind, 'user');
  assert.equal(response.zabbix.recipientType, 'user_id');
  assert.equal(response.zabbix.to, '<synthetic-user-id>');
});

test('event router routes chat event to identity plugin', () => {
  const router = createEventRouter({
    identity: handleIdentityEvent
  });

  const response = router.route(createChatEvent(), { route: 'identity' });

  assert.equal(response.kind, 'identity');
  assert.equal(response.recipient.kind, 'chat');
  assert.equal(response.zabbix.recipientType, 'chat_id');
  assert.equal(response.zabbix.to, '<synthetic-chat-id>');
});

test('event router uses identity route by default', () => {
  const router = createEventRouter({
    identity: handleIdentityEvent
  });

  const response = router.route(createUserEvent());

  assert.equal(response.kind, 'identity');
  assert.equal(response.zabbix.recipientType, 'user_id');
});

test('event router rejects unknown route safely', () => {
  const router = createEventRouter({
    identity: handleIdentityEvent
  });

  assert.throws(
    () => router.route(createUserEvent(), { route: 'unknown' }),
    /No route handler available/
  );
});
