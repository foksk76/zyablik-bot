const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function listFiles(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);

  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const result = [];
  const stack = [absoluteDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, '/');

      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else {
        result.push(relativePath);
      }
    }
  }

  return result.sort();
}

test('required project files exist', () => {
  const requiredFiles = [
    'README.md',
    'AGENTS.md',
    '.agents/project-context.md',
    'DEVELOPMENT.md',
    'docs/README.md',
    'docs/project-context.md',
    'docs/live-identity-bot.md',
    'docs/identity-plugin/README.md',
    'docs/identity-plugin/live-sprint-plan.md',
    'docs/identity-plugin/max-api-source.md',
    'docs/identity-plugin/live-transport-spec.md',
    'docs/decisions/README.md',
    'docs/decisions/ADR-0001-ai-assisted-dev.md',
    'docs/decisions/ADR-0002-use-external-agent-skills.md',
    'docs/decisions/ADR-0004-use-node-policy-tests-and-github-actions.md',
    'docs/zabbix-media-type.md',
    'tasks/sprints/README.md',
    'tasks/sprints/sprint-00.md',
    'tasks/sprints/sprint-01.md',
    'tasks/sprints/sprint-02.md',
    'tasks/sprints/sprint-03.md',
    'tasks/sprints/sprint-04.md',
    'src/zabbix-media-type/max-webhook.js',
    'package.json',
    '.github/workflows/verify.yml'
  ];

  for (const file of requiredFiles) {
    assert.ok(exists(file), `required file is missing: ${file}`);
  }
});

test('ADR files are stored only in docs/decisions', () => {
  const legacyAdrFiles = listFiles('.agents/adr');
  assert.deepEqual(legacyAdrFiles, [], 'ADR files must not be stored in .agents/adr');
});

test('task files are stored only in tasks', () => {
  const legacyTaskFiles = listFiles('.agents/tasks');
  assert.deepEqual(legacyTaskFiles, [], 'task files must not be stored in .agents/tasks');
});

test('legacy bash repository check is removed', () => {
  assert.equal(exists('scripts/verify-repo.sh'), false, 'scripts/verify-repo.sh must be removed after Node policy tests migration');
});

test('old task-18 files are removed', () => {
  assert.equal(exists('docs/task-18-breakdown.md'), false, 'docs/task-18-breakdown.md must be removed after reorganization');
  assert.equal(exists('docs/specs/task-18-1-max-api-source.md'), false, 'old specs must be removed');
  assert.equal(exists('docs/specs/task-18-2-live-transport-spec.md'), false, 'old specs must be removed');
});

test('old tasks files are removed', () => {
  assert.equal(exists('tasks/plan.md'), false, 'tasks/plan.md must be removed after sprint reorganization');
  assert.equal(exists('tasks/todo.md'), false, 'tasks/todo.md must be removed after sprint reorganization');
});

test('legacy docs/specs and docs/test-runs task-18 files are removed', () => {
  assert.equal(exists('docs/specs'), false, 'docs/specs must be removed after reorganization to identity-plugin');
  assert.equal(exists('docs/test-runs/task-18-8-live-runtime-security-review.md'), false, 'old test-run must be moved to identity-plugin');
});
