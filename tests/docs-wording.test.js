const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const scannedRoots = ['README.md', 'docs', '.agents', 'tasks'];
const blockedTerms = ['Отдел', 'SOC', 'NOC'];
const wordChars = /[А-Яа-яЁёA-Za-z0-9_]/u;

function hasStandaloneTerm(line, term) {
  let index = line.indexOf(term);

  while (index !== -1) {
    const before = index > 0 ? line[index - 1] : '';
    const afterIndex = index + term.length;
    const after = afterIndex < line.length ? line[afterIndex] : '';

    const hasLeftBoundary = before === '' || !wordChars.test(before);
    const hasRightBoundary = after === '' || !wordChars.test(after);

    if (hasLeftBoundary && hasRightBoundary) {
      return true;
    }

    index = line.indexOf(term, index + term.length);
  }

  return false;
}

function listMarkdownAndTextFiles(target) {
  const absoluteTarget = path.join(root, target);

  if (!fs.existsSync(absoluteTarget)) {
    return [];
  }

  const stat = fs.statSync(absoluteTarget);

  if (stat.isFile()) {
    return [absoluteTarget];
  }

  const result = [];
  const stack = [absoluteTarget];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (/\.(md|txt)$/i.test(entry.name)) {
        result.push(absolutePath);
      }
    }
  }

  return result.sort();
}

test('documentation does not use old organization-specific wording', () => {
  const matches = [];

  for (const scannedRoot of scannedRoots) {
    for (const file of listMarkdownAndTextFiles(scannedRoot)) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        for (const term of blockedTerms) {
          if (hasStandaloneTerm(line, term)) {
            matches.push(`${path.relative(root, file)}:${index + 1}: ${term}: ${line}`);
          }
        }
      });
    }
  }

  assert.deepEqual(matches, [], `found old organization-specific wording:\n${matches.join('\n')}`);
});

test('README references live identity bot status document without duplicating acceptance checklist', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

  assert.match(readme, /docs\/live-identity-bot\.md/);
  assert.doesNotMatch(readme, /Критерии завершения первого этапа\n\n- \[ \]/);
});

test('documentation does not contain CJK hieroglyphs', () => {
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{30000}-\u{3134f}\u{2e80}-\u{2eff}\u{31c0}-\u{31ef}\u{f900}-\u{faff}\u{2f800}-\u{2fa1f}]/u;
  const violations = [];

  for (const scannedRoot of scannedRoots) {
    for (const file of listMarkdownAndTextFiles(scannedRoot)) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (cjkPattern.test(line)) {
          violations.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }

  assert.deepEqual(violations, [], `found CJK hieroglyphs in documentation:\n${violations.join('\n')}`);
});
