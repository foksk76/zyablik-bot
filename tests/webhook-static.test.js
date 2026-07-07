const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const webhook = fs.readFileSync(path.join(root, 'src/zabbix-media-type/max-webhook.js'), 'utf8');

test('webhook requires Token and To parameters', () => {
  assert.match(webhook, /parameter "Token": parameter is missing/);
  assert.match(webhook, /parameter "To": parameter is missing/);
});

test('webhook sends authorization value through HTTP header', () => {
  assert.match(webhook, /request\.addHeader\('Authorization: ' \+ Max\.token\)/);
});

test('webhook uses platform-api2 MAX messages endpoint by default', () => {
  assert.match(webhook, /https:\/\/platform-api2\.max\.ru\/messages/);
});

test('webhook supports only documented recipient types', () => {
  assert.match(webhook, /\['chat_id', 'user_id'\]/);
});

test('webhook limits message length before sending', () => {
  assert.match(webhook, /Max\.message\.length > 4000/);
});
