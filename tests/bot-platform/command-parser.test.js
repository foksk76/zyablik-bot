const test = require('node:test');
const assert = require('node:assert/strict');

const { parseCommand } = require('../../src/bot-platform/core/command-parser');

test('parseCommand returns command and args for /help', () => {
  const result = parseCommand('/help');

  assert.deepEqual(result, { command: '/help', args: '' });
});

test('parseCommand returns command and args for /id', () => {
  const result = parseCommand('/id');

  assert.deepEqual(result, { command: '/id', args: '' });
});

test('parseCommand returns command and args for /status', () => {
  const result = parseCommand('/status');

  assert.deepEqual(result, { command: '/status', args: '' });
});

test('parseCommand extracts args after space', () => {
  const result = parseCommand('/status --verbose');

  assert.deepEqual(result, { command: '/status', args: '--verbose' });
});

test('parseCommand returns null for plain text', () => {
  assert.equal(parseCommand('hello'), null);
});

test('parseCommand returns null for empty string', () => {
  assert.equal(parseCommand(''), null);
});

test('parseCommand returns null for whitespace only', () => {
  assert.equal(parseCommand('   '), null);
});

test('parseCommand returns null for slash only', () => {
  assert.equal(parseCommand('/'), null);
});

test('parseCommand normalizes command to lowercase', () => {
  const result = parseCommand('/Help');

  assert.deepEqual(result, { command: '/help', args: '' });
});

test('parseCommand normalizes mixed case command', () => {
  const result = parseCommand('/STATUS');

  assert.deepEqual(result, { command: '/status', args: '' });
});

test('parseCommand handles leading whitespace', () => {
  const result = parseCommand('  /help');

  assert.deepEqual(result, { command: '/help', args: '' });
});

test('parseCommand returns null for non-string input', () => {
  assert.equal(parseCommand(null), null);
  assert.equal(parseCommand(undefined), null);
  assert.equal(parseCommand(42), null);
});

test('parseCommand preserves args with multiple spaces', () => {
  const result = parseCommand('/id arg1  arg2');

  assert.deepEqual(result, { command: '/id', args: 'arg1  arg2' });
});
