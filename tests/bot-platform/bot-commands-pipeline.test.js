const test = require('node:test');
const assert = require('node:assert/strict');

const { createIdentityUpdateProcessor } = require('../../src/bot-platform/core/live-pipeline');
const { runMaxIdentityDryRun } = require('../../src/bot-platform/core/dry-run-pipeline');
const { handleIdentityEvent } = require('../../src/bot-platform/plugins/identity');

const routeHandlers = { identity: handleIdentityEvent };

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

function createChatPayload(text) {
  return {
    update_type: 'message_created',
    chat_id: 2002,
    message: {
      id: '<synthetic-message-id>',
      sender: { user_id: 1001 },
      recipient: { chat_id: 2002, chat_type: 'chat' },
      body: { text }
    }
  };
}

function createUserPayload(text) {
  return {
    update_type: 'message_created',
    chat_id: 1001,
    message: {
      id: '<synthetic-message-id>',
      sender: { user_id: 1001 },
      recipient: { chat_id: 1001, chat_type: 'dialog' },
      body: { text }
    }
  };
}

test('live pipeline: /help returns command list', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    routeHandlers,
    outboundClient: outbound,
    identityHandler: handleIdentityEvent
  });

  const result = await processUpdate(createChatPayload('/help'));

  assert.equal(result.mode, 'live');
  assert.equal(result.response.kind, 'text');
  assert.ok(result.response.text.includes('/help'));
  assert.ok(result.response.text.includes('/id'));
  assert.ok(result.response.text.includes('/status'));
});

test('live pipeline: /id returns identity response', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    routeHandlers,
    outboundClient: outbound,
    identityHandler: handleIdentityEvent
  });

  const result = await processUpdate(createChatPayload('/id'));

  assert.equal(result.mode, 'live');
  assert.equal(result.response.kind, 'identity');
  assert.equal(result.response.zabbix.recipientType, 'chat_id');
});

test('live pipeline: /unknown command returns unknown command reply', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    routeHandlers,
    outboundClient: outbound,
    identityHandler: handleIdentityEvent
  });

  const result = await processUpdate(createChatPayload('/unknown'));

  assert.equal(result.mode, 'live');
  assert.equal(result.response.kind, 'text');
  assert.ok(result.response.text.includes('Unknown command'));
});

test('live pipeline: non-command text returns unknown command reply', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    routeHandlers,
    outboundClient: outbound,
    identityHandler: handleIdentityEvent
  });

  const result = await processUpdate(createChatPayload('hello world'));

  assert.equal(result.mode, 'live');
  assert.equal(result.response.kind, 'text');
  assert.ok(result.response.text.includes('Unknown command'));
});

test('live pipeline: bot_added returns welcome message', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    routeHandlers,
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
});

test('live pipeline: bot_started is ignored', async () => {
  const outbound = createRecordingOutbound();
  const processUpdate = createIdentityUpdateProcessor({
    routeHandlers,
    outboundClient: outbound,
    identityHandler: handleIdentityEvent
  });

  const result = await processUpdate({
    update_type: 'bot_started',
    timestamp: 1,
    user: { user_id: 1001 }
  });

  assert.equal(result.mode, 'ignored');
});

test('dry-run pipeline: /help returns command list', async () => {
  const result = await runMaxIdentityDryRun(
    createChatPayload('/help'),
    routeHandlers,
    { identityHandler: handleIdentityEvent }
  );

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.response.kind, 'text');
  assert.ok(result.response.text.includes('/help'));
});

test('dry-run pipeline: /id returns identity response', async () => {
  const result = await runMaxIdentityDryRun(
    createChatPayload('/id'),
    routeHandlers,
    { identityHandler: handleIdentityEvent }
  );

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.response.kind, 'identity');
  assert.equal(result.response.zabbix.recipientType, 'chat_id');
});

test('dry-run pipeline: non-command text returns unknown command reply', async () => {
  const result = await runMaxIdentityDryRun(
    createChatPayload('hello'),
    routeHandlers
  );

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.response.kind, 'text');
  assert.ok(result.response.text.includes('Unknown command'));
});

test('dry-run pipeline: bot_added returns welcome message', async () => {
  const result = await runMaxIdentityDryRun({
    update_type: 'bot_added',
    timestamp: 1,
    chat_id: 2002,
    user: { user_id: 1001 },
    is_channel: false
  }, routeHandlers);

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.response.kind, 'text');
  assert.equal(result.response.text, 'Ready to help.');
});
