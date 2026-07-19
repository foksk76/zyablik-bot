const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function extractCodeBlockAfterHeading(content, heading) {
  const headingIndex = content.indexOf(heading);
  assert.notEqual(headingIndex, -1, `heading not found: ${heading}`);

  const afterHeading = content.slice(headingIndex);
  const match = afterHeading.match(/```text\n([\s\S]*?)\n```/);
  assert.ok(match, `text code block not found after ${heading}`);

  return match[1];
}

function extractParameterNamesFromBlock(block) {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(':')[0].trim())
    .sort();
}

function extractWebhookParameterNames(scriptContent) {
  const regex = /params\.([A-Za-z_][A-Za-z0-9_]*)/g;
  const names = new Set();
  let match;

  while ((match = regex.exec(scriptContent)) !== null) {
    names.add(match[1]);
  }

  return [...names].sort();
}

test('documented Media type parameters match example parameters', () => {
  const docs = read('docs/zabbix-media-type.md');
  const example = read('examples/media-params.md');

  const docsParams = extractParameterNamesFromBlock(extractCodeBlockAfterHeading(docs, '## Параметры'));
  const exampleParams = extractParameterNamesFromBlock(extractCodeBlockAfterHeading(example, '# Пример параметров'));

  assert.deepEqual(exampleParams, docsParams);
});

test('webhook reads only documented Media type parameters', () => {
  const docs = read('docs/zabbix-media-type.md');
  const webhook = read('src/zabbix-media-type/max-webhook.js');
  const shared = read('src/shared/zabbix-message.js');

  const docsParams = extractParameterNamesFromBlock(extractCodeBlockAfterHeading(docs, '## Параметры'));
  const scriptParams = extractWebhookParameterNames(webhook + '\n' + shared);

  assert.deepEqual(scriptParams, docsParams);
});

test('HTTPProxy is documented as optional parameter', () => {
  const docs = read('docs/zabbix-media-type.md');
  const example = read('examples/media-params.md');

  assert.match(docs, /HTTPProxy:/);
  assert.match(example, /HTTPProxy:/);
  assert.match(docs, /необязательный HTTP-прокси/);
  assert.match(example, /необязательный параметр/);
});
