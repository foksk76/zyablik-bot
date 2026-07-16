const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createMaxInboundWebhookHandler } = require('../../src/bot-platform/transports/max');
const { handleIdentityEvent } = require('../../src/bot-platform/plugins/identity');

const fixturesDir = path.join(__dirname, '../../examples/bot-platform');
const routeHandlers = { identity: handleIdentityEvent };

function readFixture(fileName) {
  const filePath = path.join(fixturesDir, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('MAX inbound webhook handler accepts user fixture request', async () => {
  const handler = createMaxInboundWebhookHandler({ routeHandlers });
  const result = await handler.handle({
    body: readFixture('max-inbound-user.fixture.json')
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.networkEnabled, false);
  assert.equal(result.response.kind, 'identity');
  assert.equal(result.response.recipient.kind, 'user');
  assert.equal(result.outbound.request.body.recipientType, 'user_id');
});

test('MAX inbound webhook handler accepts chat fixture request', async () => {
  const handler = createMaxInboundWebhookHandler({ routeHandlers });
  const result = await handler.handle({
    body: readFixture('max-inbound-chat.fixture.json')
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.networkEnabled, false);
  assert.equal(result.response.kind, 'identity');
  assert.equal(result.response.recipient.kind, 'chat');
  assert.equal(result.outbound.request.body.recipientType, 'chat_id');
});

test('MAX inbound webhook handler rejects invalid request', async () => {
  const handler = createMaxInboundWebhookHandler({ routeHandlers });

  await assert.rejects(
    handler.handle({ body: null }),
    /Invalid MAX inbound request/
  );
});
