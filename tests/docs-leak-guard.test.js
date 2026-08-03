const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

// Scope: человеко-читаемая документация (docs/, tasks/, examples/, корневые MD).
// src/ и tests/ сознательно не сканируются: тестовые фикстуры содержат
// реальные MAX user_id/chat_id (например, max-event-normalizer.test.js) —
// их замена на синтетические значения требует отдельного спринта (TODO).
const scannedRoots = ['README.md', 'INSTALL.md', 'AGENTS.md', 'CHANGELOG.md', 'docs', 'tasks', 'examples'];

// Легитимные значения в документации (не утечки):
// - 127.0.0.1 / 127.0.0.0 — loopback (proxy_pass, серверы бота);
// - 169.254.169.254 — cloud metadata (SSRF-документация, ADR-0037);
// - 172.23.0.1 — docker bridge gateway (sprint-35: контейнер → хост).
const allowedPrivateHostIps = new Set([
  '127.0.0.1',
  '127.0.0.0',
  '169.254.169.254',
  '172.23.0.1'
]);

// RFC1918 + link-local + loopback, 4 октета. CIDR-формы (диапазоны) не матчатся
// отдельно — проверка на "/" после токена ниже их исключает.
const privateHostIpPattern = new RegExp(
  '\\b(?:10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}'
  + '|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}'
  + '|192\\.168\\.\\d{1,3}\\.\\d{1,3}'
  + '|169\\.254\\.\\d{1,3}\\.\\d{1,3}'
  + '|127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})'
  + '\\b',
  'g'
);

// Получатель MAX: user_id / chat_id / recipient / To с литеральным числом.
// Кавычки и префикс user:/chat: допускаются в любой позиции
// (JSON-логи: "recipient":"user:1234567890").
const recipientIdPattern = /(?:user_id|chat_id|recipient)["'\s]*[:=]\s*["']?(?:[a-z]+:)?["']?\d{6,12}["']?/gi;
// JSON-ключ "value" со значением-числом (примеры события доставки).
const valueIdPattern = /"value"\s*[:=]\s*"?\d{6,12}"?/g;
// Zabbix Media type параметр "To" — только с заглавной буквы, чтобы не
// зацепить JS-свойство "to" (unix-таймстампы в примерах кода).
const toParamPattern = /\bTo:\s*"?\d{6,12}"?/g;

// Секрет-подобные литералы: client_secret / Token / API_KEY / Authorization Bearer.
const secretShapePattern = /(?:client[_ ]?secret|Token|API[_ -]?KEY)\s*[=:]\s*"?[A-Za-z0-9._-]{10,}"?/gi;
const basicAuthPattern = /-u\s+['"][^'"]{8,}['"]/g;
const bearerPattern = /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{16,}/gi;

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

function isPlaceholder(value) {
  return /[<>$]/.test(value) || value.includes('{') || value.includes('}');
}

// Markdown-таблица параметров: первая ячейка — имя параметра-секрета,
// значение в одной из следующих ячеек не может быть литеральным токеном.
// Форма требует хотя бы одну букву и одну цифру — синтетические описания
// вроде "Line-height" (без цифр) не срабатывают.
const secretParamNames = /^(?:client[_ ]?secret|token|api[_ -]?key)$/i;
const secretTokenShape = /^(?=[^A-Za-z]*[0-9])(?=[^0-9]*[A-Za-z])[A-Za-z0-9._-]{10,}$/;

function collectTableCellSecretViolations(content, file, violations) {
  for (const line of content.split('\n')) {
    if (!line.trim().startsWith('|')) {
      continue;
    }

    const cells = line
      .split('|')
      .map((cell) => cell.trim().replace(/^`|`$/g, ''))
      .filter((cell) => cell !== '');

    if (cells.length < 2 || !secretParamNames.test(cells[0])) {
      continue;
    }

    for (const cell of cells.slice(1)) {
      if (isPlaceholder(cell) || !secretTokenShape.test(cell)) {
        continue;
      }

      violations.push(`${path.relative(root, file)}: ${cell}`);
    }
  }
}

function collectMatches(pattern, content) {
  const matches = [];

  for (const match of content.matchAll(pattern)) {
    matches.push({ index: match.index, text: match[0] });
  }

  return matches;
}

test('documentation contains no private host IP addresses', () => {
  const violations = [];

  for (const scannedRoot of scannedRoots) {
    for (const file of listMarkdownAndTextFiles(scannedRoot)) {
      const content = fs.readFileSync(file, 'utf8');

      for (const match of collectMatches(privateHostIpPattern, content)) {
        const ip = match.text;
        const after = content[match.index + ip.length] || '';

        if (after === '/') {
          continue;
        }

        if (allowedPrivateHostIps.has(ip)) {
          continue;
        }

        violations.push(`${path.relative(root, file)}: ${ip}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    'найдены внутренние IP-адреса в документации — замените на <stand-ip>:\n' + violations.join('\n')
  );
});

test('documentation contains no real MAX user/chat ids', () => {
  const violations = [];

  for (const scannedRoot of scannedRoots) {
    for (const file of listMarkdownAndTextFiles(scannedRoot)) {
      const content = fs.readFileSync(file, 'utf8');

      for (const pattern of [recipientIdPattern, valueIdPattern, toParamPattern]) {
        for (const match of collectMatches(pattern, content)) {
          violations.push(`${path.relative(root, file)}: ${match.text}`);
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    'найдены литеральные user_id/chat_id в документации — замените на <user_id>:\n' + violations.join('\n')
  );
});

test('documentation contains no literal secrets (use placeholders)', () => {
  const violations = [];

  for (const scannedRoot of scannedRoots) {
    for (const file of listMarkdownAndTextFiles(scannedRoot)) {
      const content = fs.readFileSync(file, 'utf8');

      for (const pattern of [secretShapePattern, basicAuthPattern, bearerPattern]) {
        for (const match of collectMatches(pattern, content)) {
          const value = match.text;

          if (isPlaceholder(value)) {
            continue;
          }

          violations.push(`${path.relative(root, file)}: ${value}`);
        }
      }

      collectTableCellSecretViolations(content, file, violations);
    }
  }

  assert.deepEqual(
    violations,
    [],
    'найдены литеральные секреты в документации — замените на <...> плейсхолдер:\n' + violations.join('\n')
  );
});
