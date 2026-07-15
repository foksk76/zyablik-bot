const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { runMaxIdentityDryRun } = require('../../src/bot-platform/app');

const fixturesDir = path.join(__dirname, '../../examples/bot-platform');

function readFixture(fileName) {
  const filePath = path.join(fixturesDir, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

test('dry-run pipeline returns identity response for user fixture', async () => {
  const result = await runMaxIdentityDryRun(readFixture('max-inbound-user.fixture.json'));

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.networkEnabled, false);
  assert.equal(result.response.kind, 'identity');
  assert.equal(result.response.recipient.kind, 'user');
  assert.equal(result.response.zabbix.recipientType, 'user_id');
  assert.equal(result.response.zabbix.to, '<synthetic-user-id>');
  assert.equal(result.outbound.mode, 'dry-run');
  assert.equal(result.outbound.networkEnabled, false);
  assert.equal(result.outbound.request.body.recipientType, 'user_id');
});

test('dry-run pipeline returns identity response for chat fixture', async () => {
  const result = await runMaxIdentityDryRun(readFixture('max-inbound-chat.fixture.json'));

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.networkEnabled, false);
  assert.equal(result.response.kind, 'identity');
  assert.equal(result.response.recipient.kind, 'chat');
  assert.equal(result.response.zabbix.recipientType, 'chat_id');
  assert.equal(result.response.zabbix.to, '<synthetic-chat-id>');
  assert.equal(result.outbound.request.body.recipientType, 'chat_id');
});

test('dry-run pipeline does not expose raw event payload in response', async () => {
  const result = await runMaxIdentityDryRun(readFixture('max-inbound-user.fixture.json'));

  assert.equal(result.response.raw, undefined);
  assert.doesNotMatch(result.response.text, /<synthetic-message-id>/);
  assert.equal(result.raw, undefined);
  assert.equal(result.outbound.request.body.raw, undefined);
});

test('dry-run pipeline rejects invalid MAX payload safely', async () => {
  await assert.rejects(
    runMaxIdentityDryRun({}),
    /Unsupported MAX chat type/
  );
});
