const test = require('node:test');
const assert = require('node:assert/strict');

const { createIdentityUpdateProcessor } = require('../../src/bot-platform/core/live-pipeline');
const { createQueueStore } = require('../../src/bot-platform/queue/store');

function makeMaxMessage() {
  return {
    update_id: 1001,
    update_type: 'message_created',
    message: {
      message_id: 100,
      chat: { id: 12345, type: 'dialog' },
      from: { id: 12345, username: 'testuser' },
      sender: { user_id: 12345 },
      recipient: { chat_type: 'dialog' },
      text: '/help',
      date: Date.now() / 1000
    }
  };
}

function createMockOutboundClient() {
  let lastResponse = null;
  return {
    send: async (response) => {
      lastResponse = response;
      return { mode: 'live', networkEnabled: true };
    },
    getLastResponse: () => lastResponse
  };
}

test('live-pipeline + queue enabled → enqueue called, send not called', async () => {
  const store = createQueueStore({ dbPath: ':memory:' });
  let sendCalled = false;
  let enqueuedPayload = null;

  const mockOutbound = {
    send: async (response) => {
      sendCalled = true;
      return { mode: 'live', networkEnabled: true };
    }
  };

  const mockStore = {
    enqueue: (entry) => {
      enqueuedPayload = entry;
      return { id: 1 };
    },
    dequeue: () => [],
    ack: () => {},
    nack: () => {}
  };

  const processor = createIdentityUpdateProcessor({
    outboundClient: mockOutbound,
    queueStore: mockStore,
    queueEnabled: true
  });

  const result = await processor(makeMaxMessage());

  assert.equal(sendCalled, false);
  assert.equal(enqueuedPayload !== null, true);
  assert.equal(result.mode, 'queued');
  store.close();
});

test('live-pipeline + queue disabled → send called, enqueue not called', async () => {
  let sendCalled = false;
  let enqueueCalled = false;

  const mockOutbound = {
    send: async (response) => {
      sendCalled = true;
      return { mode: 'live', networkEnabled: true };
    }
  };

  const mockStore = {
    enqueue: (entry) => {
      enqueueCalled = true;
      return { id: 1 };
    },
    dequeue: () => [],
    ack: () => {},
    nack: () => {}
  };

  const processor = createIdentityUpdateProcessor({
    outboundClient: mockOutbound,
    queueStore: mockStore,
    queueEnabled: false
  });

  const result = await processor(makeMaxMessage());

  assert.equal(sendCalled, true);
  assert.equal(enqueueCalled, false);
  assert.equal(result.mode, 'live');
});

test('live-pipeline + no queueStore → send called', async () => {
  let sendCalled = false;

  const mockOutbound = {
    send: async (response) => {
      sendCalled = true;
      return { mode: 'live', networkEnabled: true };
    }
  };

  const processor = createIdentityUpdateProcessor({
    outboundClient: mockOutbound,
    queueStore: null
  });

  const result = await processor(makeMaxMessage());

  assert.equal(sendCalled, true);
  assert.equal(result.mode, 'live');
});

test('live-pipeline + ignored update type → neither send nor enqueue', async () => {
  let sendCalled = false;
  let enqueueCalled = false;

  const mockOutbound = {
    send: async (response) => {
      sendCalled = true;
      return { mode: 'live', networkEnabled: true };
    }
  };

  const mockStore = {
    enqueue: (entry) => {
      enqueueCalled = true;
      return { id: 1 };
    },
    dequeue: () => [],
    ack: () => {},
    nack: () => {}
  };

  const processor = createIdentityUpdateProcessor({
    outboundClient: mockOutbound,
    queueStore: mockStore,
    queueEnabled: true
  });

  const result = await processor({
    update_id: 1001,
    edited_channel_post: { message_id: 1 }
  });

  assert.equal(sendCalled, false);
  assert.equal(enqueueCalled, false);
  assert.equal(result.mode, 'ignored');
});
