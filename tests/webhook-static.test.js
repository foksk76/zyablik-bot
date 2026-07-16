const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const webhook = fs.readFileSync(path.join(root, 'src/zabbix-media-type/max-webhook.js'), 'utf8');

test('webhook validates Token parameter', () => {
  assert.ok(
    webhook.includes('params.Token'),
    'webhook must check params.Token'
  );
  assert.ok(
    webhook.includes('parameter "Token": parameter is missing'),
    'webhook must report missing Token parameter'
  );
});

test('webhook validates To parameter', () => {
  assert.ok(
    webhook.includes('params.To'),
    'webhook must check params.To'
  );
  assert.ok(
    webhook.includes('parameter "To": parameter is missing'),
    'webhook must report missing To parameter'
  );
});

test('webhook sends authorization through HTTP header', () => {
  assert.ok(
    webhook.includes('Authorization'),
    'webhook must set Authorization header'
  );
  assert.ok(
    webhook.includes('Max.token'),
    'webhook must use Max.token for authorization'
  );
});

test('webhook uses platform-api2 MAX messages endpoint by default', () => {
  assert.ok(
    webhook.includes('https://platform-api2.max.ru/messages'),
    'webhook must default to platform-api2 MAX messages endpoint'
  );
});

test('webhook supports only chat_id and user_id recipient types', () => {
  assert.ok(
    webhook.includes('chat_id'),
    'webhook must support chat_id recipient type'
  );
  assert.ok(
    webhook.includes('user_id'),
    'webhook must support user_id recipient type'
  );
});

test('webhook limits message length to 4000 characters', () => {
  assert.ok(
    webhook.includes('4000'),
    'webhook must enforce a 4000 character message limit'
  );
  assert.ok(
    webhook.includes('.substring(0, 3990)'),
    'webhook must truncate long messages at 3990 characters'
  );
});

test('webhook handles HTTP error responses', () => {
  assert.ok(
    webhook.includes('getStatus()'),
    'webhook must check HTTP status code'
  );
  assert.ok(
    /getStatus\(\)\s*<\s*200\s*\|\|\s*request\.getStatus\(\)\s*>=\s*300/.test(webhook),
    'webhook must validate 2xx status range'
  );
});

test('webhook supports HTTP proxy configuration', () => {
  assert.ok(
    webhook.includes('setProxy'),
    'webhook must call setProxy when proxy is configured'
  );
});

test('webhook supports custom API URL', () => {
  assert.ok(
    webhook.includes('params.APIUrl'),
    'webhook must accept custom APIUrl parameter'
  );
});

test('webhook supports ParseMode for message formatting', () => {
  assert.ok(
    webhook.includes('ParseMode'),
    'webhook must accept ParseMode parameter'
  );
  assert.ok(
    webhook.includes('escapeMarkup'),
    'webhook must have escapeMarkup function for formatting'
  );
});
