const test = require('node:test');
const assert = require('node:assert/strict');

const { createIdentityUpdateProcessor } = require('../../src/bot-platform/core');
const { getUpdateType } = require('../../src/bot-platform/transports/max');
const { handleIdentityEvent } = require('../../src/bot-platform/plugins/identity');

function createRecordingOutbound() {
  const calls = [];

  return {
    send(response) {
      calls.push(response);

      return {
        mode: 'live',
        networkEnabled: true,
        response: { statusCode: 200 },
        payload: response.zabbix || response.recipient
      };
    },
    calls
  };
}

test('identity processor replies to /id command with identity response', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    outboundClient: outbound,
    identityHandler: handleIdentityEvent
  });

  const result = await processUpdate({
    update_type: 'message_created',
    chat_id: 2002,
    message: {
      id: '<synthetic-message-id>',
      sender: { user_id: 1001 },
      recipient: { chat_id: 2002 },
      body: { text: '/id' }
    }
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.response.kind, 'identity');
  assert.equal(outbound.calls.length, 1);
});

test('identity processor returns unknown command for non-command text', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    outboundClient: outbound,
    identityHandler: handleIdentityEvent
  });

  const result = await processUpdate({
    update_type: 'message_created',
    chat_id: 2002,
    message: {
      id: '<synthetic-message-id>',
      sender: { user_id: 1001 },
      recipient: { chat_id: 2002 },
      body: { text: 'show this chat recipient id' }
    }
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.response.kind, 'text');
  assert.ok(result.response.text.includes('Unknown command'));
  assert.equal(outbound.calls.length, 1);
});

test('identity processor sends welcome on bot_added', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    outboundClient: outbound,
    identityHandler: handleIdentityEvent
  });

  const result = await processUpdate({
    update_type: 'bot_added',
    timestamp: 1,
    chat_id: 2002,
    user: { user_id: 1001 },
    is_channel: false
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.response.kind, 'text');
  assert.equal(result.response.text, 'Ready to help.');
  assert.equal(result.response.recipient.kind, 'chat');
  assert.equal(outbound.calls.length, 1);
});

test('identity processor sends welcome on bot_started', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    outboundClient: outbound,
    identityHandler: handleIdentityEvent
  });

  const result = await processUpdate({
    update_type: 'bot_started',
    timestamp: 1,
    user: { user_id: 1001 }
  });

  assert.equal(result.mode, 'live');
  assert.equal(result.response.kind, 'text');
  assert.equal(result.response.text, 'Ready to help.');
  assert.equal(result.response.recipient.kind, 'user');
  assert.equal(outbound.calls.length, 1);
});

test('identity processor ignores updates of unknown type without throwing', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({ outboundClient: outbound });

  const result = await processUpdate({
    update_type: 'callback_query',
    timestamp: 1
  });

  assert.equal(result.mode, 'ignored');
  assert.equal(result.updateType, 'callback_query');
  assert.equal(outbound.calls.length, 0);
});

test('getUpdateType exposes the normalized update type from a MAX payload', () => {
  assert.equal(getUpdateType({ update_type: 'message_created' }), 'message_created');
  assert.equal(getUpdateType({ event_type: 'bot_added' }), 'bot_added');
  assert.equal(getUpdateType({}), undefined);
});
