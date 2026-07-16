const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  normalizeMaxEvent
} = require('../../src/bot-platform/transports/max/event-normalizer');

const fixturesDir = path.join(__dirname, '../../examples/bot-platform');

function readFixture(fileName) {
  const filePath = path.join(fixturesDir, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('normalizeMaxEvent maps user fixture to internal user recipient event', () => {
  const fixture = readFixture('max-inbound-user.fixture.json');
  const event = normalizeMaxEvent(fixture);

  assert.equal(event.source, 'max');
  assert.equal(event.recipient.kind, 'user');
  assert.equal(event.recipient.value, '<synthetic-user-id>');
  assert.equal(event.message.text, 'show my recipient id');
  assert.equal(event.raw.kind, 'reference');
  assert.equal(event.raw.value, '<synthetic-message-id>');
});

test('normalizeMaxEvent maps chat fixture to internal chat recipient event', () => {
  const fixture = readFixture('max-inbound-chat.fixture.json');
  const event = normalizeMaxEvent(fixture);

  assert.equal(event.source, 'max');
  assert.equal(event.recipient.kind, 'chat');
  assert.equal(event.recipient.value, '<synthetic-chat-id>');
  assert.equal(event.message.text, 'show this chat recipient id');
  assert.equal(event.raw.kind, 'reference');
  assert.equal(event.raw.value, '<synthetic-message-id>');
});

test('normalizeMaxEvent maps official personal dialog message_created shape to user recipient', () => {
  const event = normalizeMaxEvent({
    update_type: 'message_created',
    message: {
      id: '<synthetic-message-id>',
      sender: {
        user_id: 1001
      },
      recipient: {
        user_id: 1001
      },
      body: {
        text: 'show my recipient id'
      }
    }
  });

  assert.equal(event.recipient.kind, 'user');
  assert.equal(event.recipient.value, '1001');
  assert.equal(event.message.text, 'show my recipient id');
  assert.equal(event.raw.value, '<synthetic-message-id>');
});

test('normalizeMaxEvent maps official chat message_created shape to chat recipient', () => {
  const event = normalizeMaxEvent({
    update_type: 'message_created',
    chat_id: 2002,
    message: {
      id: '<synthetic-message-id>',
      sender: {
        user_id: 1001
      },
      recipient: {
        chat_id: 2002
      },
      body: {
        text: 'show this chat recipient id'
      }
    }
  });

  assert.equal(event.recipient.kind, 'chat');
  assert.equal(event.recipient.value, '2002');
  assert.equal(event.message.text, 'show this chat recipient id');
});

test('normalizeMaxEvent maps personal dialog message_created to user sender when recipient has chat_type dialog', () => {
  // Regression for the personal-dialog reply bug: the real MAX API sends
  // message.recipient with { chat_id, chat_type: "dialog", user_id } for
  // personal messages. chat_type === "dialog" is the authoritative indicator
  // and must route to sender.user_id, not recipient.chat_id.
  const event = normalizeMaxEvent({
    update_type: 'message_created',
    timestamp: 1,
    message: {
      id: '<synthetic-message-id>',
      recipient: {
        chat_id: 476343869,
        chat_type: 'dialog',
        user_id: 292993971
      },
      body: {
        text: 'show my recipient id'
      },
      sender: {
        user_id: 219338126
      }
    }
  });

  assert.equal(event.recipient.kind, 'user');
  assert.equal(event.recipient.value, '219338126');
  assert.equal(event.message.text, 'show my recipient id');
});

test('normalizeMaxEvent maps group message_created to chat recipient even when sender user_id is present', () => {
  // Regression for the group-chat reply bug: a real MAX group message_created
  // carries message.recipient.{chat_id, chat_type} and a sender.user_id. The
  // recipient (chat) must win over the sender (user), otherwise the bot replies
  // to the sender in a direct message instead of the group chat.
  const event = normalizeMaxEvent({
    update_type: 'message_created',
    timestamp: 1,
    message: {
      recipient: {
        chat_id: 2002,
        chat_type: 'chat'
      },
      timestamp: 1,
      body: {
        text: 'show this chat recipient id'
      },
      sender: {
        user_id: 1001
      }
    }
  });

  assert.equal(event.recipient.kind, 'chat');
  assert.equal(event.recipient.value, '2002');
  assert.equal(event.message.text, 'show this chat recipient id');
});

test('normalizeMaxEvent maps official bot_started shape to user recipient', () => {
  const event = normalizeMaxEvent({
    update_type: 'bot_started',
    timestamp: 1,
    user: {
      user_id: 1001
    }
  });

  assert.equal(event.recipient.kind, 'user');
  assert.equal(event.recipient.value, '1001');
  assert.equal(event.message.text, '');
});

test('normalizeMaxEvent maps official bot_added shape to chat recipient', () => {
  const event = normalizeMaxEvent({
    update_type: 'bot_added',
    timestamp: 1,
    chat_id: 2002,
    user: {
      user_id: 1001
    },
    is_channel: false
  });

  assert.equal(event.recipient.kind, 'chat');
  assert.equal(event.recipient.value, '2002');
  assert.equal(event.message.text, '');
});

test('normalizeMaxEvent rejects missing payload', () => {
  assert.throws(
    () => normalizeMaxEvent(),
    /Invalid MAX inbound event/
  );
});

test('normalizeMaxEvent rejects unsupported chat type', () => {
  assert.throws(
    () => normalizeMaxEvent({
      source: 'max',
      chat: { type: 'unsupported', id: '<synthetic-chat-id>' },
      sender: { type: 'user', id: '<synthetic-user-id>' },
      message: { id: '<synthetic-message-id>', text: 'hello' }
    }),
    /Unsupported MAX chat type/
  );
});

test('normalizeMaxEvent rejects event without recipient value', () => {
  assert.throws(
    () => normalizeMaxEvent({
      source: 'max',
      chat: { type: 'group' },
      sender: { type: 'user', id: '<synthetic-user-id>' },
      message: { id: '<synthetic-message-id>', text: 'hello' }
    }),
    /Missing MAX recipient value/
  );
});

test('normalizeMaxEvent rejects dialog event without sender id', () => {
  assert.throws(
    () => normalizeMaxEvent({
      source: 'max',
      chat: { type: 'dialog', id: '<synthetic-user-id>' },
      sender: { type: 'user' },
      message: { id: '<synthetic-message-id>', text: 'hello' }
    }),
    /Missing MAX recipient value/
  );
});

test('normalizeMaxEvent maps channel message_created to chat recipient', () => {
  const event = normalizeMaxEvent({
    update_type: 'message_created',
    timestamp: 1,
    message: {
      recipient: {
        chat_id: 3003,
        chat_type: 'channel'
      },
      body: { text: 'channel post' },
      sender: { user_id: 1001 }
    }
  });

  assert.equal(event.recipient.kind, 'chat');
  assert.equal(event.recipient.value, '3003');
  assert.equal(event.message.text, 'channel post');
});

test('normalizeMaxEvent output has exactly {source, recipient, message, raw}', () => {
  const event = normalizeMaxEvent({
    update_type: 'message_created',
    timestamp: 1,
    message: {
      id: '<synthetic-message-id>',
      sender: { user_id: 1001 },
      recipient: { chat_id: 2002, chat_type: 'chat' },
      body: { text: 'hello' }
    }
  });

  const keys = Object.keys(event);
  assert.deepEqual(keys.sort(), ['message', 'raw', 'recipient', 'source']);
});
