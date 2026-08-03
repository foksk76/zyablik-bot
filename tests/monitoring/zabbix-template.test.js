const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const templatePath = path.join(root, 'docs/zabbix-template/zyablik-monitoring-template.yaml');

const EXPECTED_ITEM_KEYS = [
  'zyablik.summary',
  'zyablik.get.discovery',
  'zyablik.readyz',
  'zyablik.status.pending',
  'zyablik.status.processing',
  'zyablik.status.delivered',
  'zyablik.status.failed',
  'zyablik.status.total',
  'zyablik.status.totalAttempts',
  'zyablik.backlog',
  'zyablik.status.pending.delta',
  'zyablik.status.processing.delta',
  'zyablik.status.failed.delta',
  'zyablik.backlog.delta'
];

const STATUS_FIELDS = [
  ['zyablik.status.pending', 'pending'],
  ['zyablik.status.processing', 'processing'],
  ['zyablik.status.delivered', 'delivered'],
  ['zyablik.status.failed', 'failed'],
  ['zyablik.status.total', 'total'],
  ['zyablik.status.totalAttempts', 'totalAttempts']
];

function readLines() {
  const content = fs.readFileSync(templatePath, 'utf8');
  return { content, lines: content.split('\n') };
}

function templateItemBlock(lines, key) {
  const keyLineIndex = lines.findIndex(
    (line) => /^          key: /.test(line) && line.includes(key)
  );
  assert.ok(keyLineIndex !== -1, `template item key not found: ${key}`);

  let start = keyLineIndex;
  while (start > 0 && !/^        - uuid:/.test(lines[start])) {
    start--;
  }

  let end = keyLineIndex + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (/^        - uuid:/.test(line) || /^      [a-z_]+:/.test(line) || /^    - uuid:/.test(line)) {
      break;
    }
    end++;
  }

  return lines.slice(start, end).join('\n');
}

test('zabbix template file exists', () => {
  assert.ok(fs.existsSync(templatePath), 'docs/zabbix-template/zyablik-monitoring-template.yaml must exist');
});

test('zabbix template has 7.0 export header', () => {
  const { lines } = readLines();
  assert.equal(lines[0], 'zabbix_export:');
  assert.ok(lines.some((line) => line === "  version: '7.0'"), 'zabbix_export version must be 7.0');
});

test('zabbix template uses spaces, not tabs', () => {
  const { lines } = readLines();
  const tabs = lines.filter((line) => line.includes('\t'));
  assert.deepEqual(tabs, [], 'template must not contain tab characters');
});

test('template identity is set', () => {
  const { lines } = readLines();
  assert.ok(lines.some((line) => line === "      template: 'Zyablik monitoring'"));
  assert.ok(lines.some((line) => line === "      name: 'Zyablik monitoring'"));
  assert.ok(lines.some((line) => line === '      groups:'));
});

test('template contains all expected item keys and they are unique', () => {
  const { lines } = readLines();
  const itemKeys = lines
    .filter((line) => /^          key: /.test(line))
    .map((line) => line.replace(/^          key: /, '').replace(/^'|'$/g, ''));

  const unique = new Set(itemKeys);
  assert.equal(itemKeys.length, unique.size, 'item keys must be unique');

  for (const key of EXPECTED_ITEM_KEYS) {
    assert.ok(unique.has(key), `expected item key is missing: ${key}`);
  }
});

test('status items are dependent on zyablik.summary with matching JSONPath', () => {
  const { lines } = readLines();

  for (const [key, field] of STATUS_FIELDS) {
    const block = templateItemBlock(lines, key);
    assert.match(block, /type: DEPENDENT/, `${key} must be a dependent item`);
    assert.match(block, /delay: '0'/, `${key} must not poll independently`);
    assert.match(block, /master_item:\n\s+key: zyablik.summary/, `${key} must master on zyablik.summary`);
    assert.match(block, new RegExp(`parameters:\\n\\s+- '\\$\\.${field}'`), `${key} must extract $.${field} via JSONPath`);
  }
});

test('masters are HTTP agent items with status code check', () => {
  const { lines } = readLines();

  for (const key of ['zyablik.summary', 'zyablik.get.discovery', 'zyablik.readyz']) {
    const block = templateItemBlock(lines, key);
    assert.match(block, /type: HTTP_AGENT/, `${key} must be an HTTP agent item`);
    assert.match(block, /status_codes: '200'/, `${key} must require HTTP 200`);
  }
});

test('readyz does not require auth', () => {
  const { lines } = readLines();
  const block = templateItemBlock(lines, 'zyablik.readyz');
  assert.doesNotMatch(block, /Authorization/, 'zyablik.readyz must not send an Authorization header');
});

test('readyz keeps history so the nodata trigger can evaluate', () => {
  // nodata() в триггере «бот недоступен» требует history: при history: '0'
  // выражение не вычисляется («item history is disabled») и триггер никогда
  // не срабатывает. Живой стенд поймал это на отказе бота.
  const { lines } = readLines();
  const block = templateItemBlock(lines, 'zyablik.readyz');
  const history = block.match(/history: '([^']+)'/);
  assert.ok(history, 'zyablik.readyz must declare history');
  assert.notEqual(history[1], '0', 'zyablik.readyz history must be enabled for nodata()');
});

test('metrics endpoints use Bearer API key macro', () => {
  const { lines } = readLines();

  for (const key of ['zyablik.summary', 'zyablik.get.discovery']) {
    const block = templateItemBlock(lines, key);
    assert.match(
      block,
      /name: Authorization\n\s+value: 'Bearer \{\$ZYABLIK\.API_KEY\}'/,
      `${key} must use Bearer with the {$ZYABLIK.API_KEY} macro`
    );
  }
});

test('secret macro has no value in the template', () => {
  const { lines } = readLines();
  const macroIndex = lines.findIndex((line) => line.includes("'{$ZYABLIK.API_KEY}'"));
  assert.ok(macroIndex !== -1, 'macro {$ZYABLIK.API_KEY} must be defined');

  let end = macroIndex;
  while (end < lines.length && !/^        - macro:/.test(lines[end])) {
    end++;
  }

  const macroBlock = lines.slice(macroIndex, end);
  const hasValue = macroBlock.some((line) => /^          value:/.test(line));
  assert.equal(hasValue, false, 'secret macro {$ZYABLIK.API_KEY} must not carry a value in the template');

  const anySecretValue = lines.some(
    (line) => /^          value:/.test(line) && /(key|token|secret|password)/i.test(line)
  );
  assert.equal(anySecretValue, false, 'template must not define secret-like macro values');
});

test('template contains no em-dashes (Zabbix YAML import quirk)', () => {
  // Zabbix 7.2 (symfony/yaml) молча теряет триггеры, если в одиночных
  // кавычках (описание/event_name) встречается тире U+2014. Живой импорт
  // проваливал верификацию (ожидалось 4 триггера, создавалось 3).
  // Вместо «—» используем обычный дефис.
  const { content } = readLines();
  const hits = content.split('\n')
    .map((line, index) => (line.includes('\u2014') ? `${index + 1}: ${line}` : null))
    .filter(Boolean);
  assert.deepEqual(hits, [], 'template must not contain em-dash (U+2014)');
});

test('template contains no real secrets or credentials', () => {
  const { content } = readLines();
  const secrets = [];

  content.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('value:') && /['"][A-Za-z0-9+/_=.-]{24,}['"]$/.test(trimmed)) {
      secrets.push(`${index + 1}: ${trimmed}`);
    }
    if (/Bearer\s+[A-Za-z0-9._-]{16,}/.test(line) && !line.includes('{$')) {
      secrets.push(`${index + 1}: ${trimmed}`);
    }
  });

  assert.deepEqual(secrets, [], `template contains credential-like values:\n${secrets.join('\n')}`);
});

test('LLD rule discovers queue metrics from /api/metrics/discovery', () => {
  const { lines } = readLines();
  const block = templateItemBlock(lines, 'zyablik.queue.discovery');

  assert.match(block, /name: 'Zyablik queue metrics discovery'/);
  assert.match(block, /type: DEPENDENT/);
  assert.match(block, /master_item:\n\s+key: zyablik\.get\.discovery/, 'LLD rule must master on zyablik.get.discovery');
  assert.match(block, /parameters:\n\s+- '\$\.data'/, 'LLD rule must extract $.data via JSONPath');

  const prototype = block.match(/item_prototypes:[\s\S]*$/)[0];
  assert.match(prototype, /key: 'zyablik\.queue\[\{#METRIC\}\]'/, 'item prototype key must use {#METRIC}');
  assert.match(prototype, /parameters:\n\s+- '\$\.\{#METRIC\}'/, 'item prototype must extract $.{#METRIC} via JSONPath');
  assert.match(prototype, /master_item:\n\s+key: zyablik\.summary/, 'item prototype must master on zyablik.summary');
});

test('triggers reference the template host and configured macros', () => {
  const { lines } = readLines();
  const triggerIndex = lines.findIndex((line) => line === '  triggers:');
  assert.ok(triggerIndex !== -1, 'top-level triggers section must exist');

  const triggers = [];
  for (let i = triggerIndex + 1; i < lines.length; i++) {
    if (/^    - uuid:/.test(lines[i])) {
      triggers.push(i);
    }
    if (lines[i].startsWith('  graphs:')) {
      break;
    }
  }

  assert.equal(triggers.length, 4, 'template must define exactly 4 triggers');

  const triggerNames = ['Zyablik: бот недоступен', 'Zyablik: очередь не разгружается', 'Zyablik: рост числа ошибок доставки', 'Zyablik: накопление ошибок доставки'];
  const full = lines.slice(triggerIndex).join('\n');

  for (const name of triggerNames) {
    assert.ok(full.includes(name), `trigger is missing: ${name}`);
  }

  const expressions = full.match(/^      expression: '[^']+'/gm) || [];
  assert.equal(expressions.length, 4, 'each trigger must have an expression');
  for (const expression of expressions) {
    assert.match(expression, /\/Zyablik monitoring\//, 'trigger expressions must reference the template host');
  }
});

test('nodata trigger uses a bare-macro period (Zabbix quirk)', () => {
  // Zabbix 7.x не принимает арифметику в периоде nodata():
  // nodata(...,3*{$ZYABLIK.POLL_INTERVAL}) и даже nodata(...,3*60)
  // молча теряют триггер при configuration.import (создаётся 3 из 4).
  // Работает только константа или голый макрос.
  const { lines } = readLines();
  const full = lines.join('\n');
  const match = full.match(/expression: 'nodata\([^']*'/);
  assert.ok(match, 'nodata trigger expression must exist');
  assert.match(
    match[0],
    /\{\$ZYABLIK\.NODATA_SEC\}/,
    'nodata period must be a bare macro {$ZYABLIK.NODATA_SEC}'
  );
  assert.doesNotMatch(match[0], /\*\{/, 'nodata period must not use arithmetic with a macro');
});

test('trigger expressions avoid arithmetic inside function periods', () => {
  const { lines } = readLines();
  const triggerIndex = lines.findIndex((line) => line === '  triggers:');
  assert.ok(triggerIndex !== -1, 'top-level triggers section must exist');

  const full = lines.slice(triggerIndex).join('\n');
  const expressions = full.match(/^      expression: '[^']+'/gm) || [];
  for (const expression of expressions) {
    assert.doesNotMatch(
      expression,
      /\*\{/,
      `expression must not multiply a macro inside a function period: ${expression}`
    );
  }
});

test('NODATA_SEC macro is defined with a numeric default', () => {
  const { lines } = readLines();
  const macroIndex = lines.findIndex((line) => line.includes("'{$ZYABLIK.NODATA_SEC}'"));
  assert.ok(macroIndex !== -1, 'macro {$ZYABLIK.NODATA_SEC} must be defined');

  const macroLines = lines.slice(macroIndex, macroIndex + 4);
  assert.ok(
    macroLines.some((line) => /^          value: '[0-9]+'$/.test(line)),
    '{$ZYABLIK.NODATA_SEC} must have a numeric default'
  );
});

test('graphs are defined for the template host', () => {
  const { lines } = readLines();
  const graphIndex = lines.findIndex((line) => line === '  graphs:');
  assert.ok(graphIndex !== -1, 'top-level graphs section must exist');

  let graphCount = 0;
  for (let i = graphIndex + 1; i < lines.length; i++) {
    if (/^    - uuid:/.test(lines[i])) {
      graphCount++;
    }
  }

  assert.equal(graphCount, 2, 'template must define exactly 2 graphs');

  const full = lines.slice(graphIndex).join('\n');
  const hosts = full.match(/host: '([^']+)'/g) || [];
  assert.ok(hosts.length > 0, 'graphs must reference items');
  assert.ok(
    hosts.every((host) => host === "host: 'Zyablik monitoring'"),
    'graph items must reference the template host'
  );

  const itemRefs = full.match(/key: (zyablik\.[A-Za-z.]+)/g) || [];
  assert.ok(itemRefs.includes('key: zyablik.status.pending'), 'status graph must include pending');
  assert.ok(itemRefs.includes('key: zyablik.backlog'), 'backlog graph must include backlog');
});

function templateDashboardBlock(lines) {
  const index = lines.findIndex((line) => line === '      dashboards:');
  assert.ok(index !== -1, 'template dashboards section must exist');
  let end = index + 1;
  while (end < lines.length && !/^  [a-z_]+:/.test(lines[end])) {
    end++;
  }
  return lines.slice(index, end).join('\n');
}

test('template defines exactly one monitoring dashboard', () => {
  const { lines } = readLines();
  const block = templateDashboardBlock(lines);

  const dashboards = block.match(/^        - uuid:/gm) || [];
  assert.equal(dashboards.length, 1, 'template must define exactly 1 dashboard');

  assert.match(block, /name: 'Zyablik: Обзор'/, 'dashboard must be named "Zyablik: Обзор"');
  assert.match(block, /pages:\n\s+- name: 'Обзор очереди'/, 'dashboard must have a page "Обзор очереди"');

  const widgetTypes = block.match(/^                - type: (item|svggraph|problems)/gm) || [];
  const count = (type) => widgetTypes.filter((w) => w.includes(type)).length;
  assert.equal(count('item'), 4, 'dashboard must have 4 item widgets');
  assert.equal(count('svggraph'), 2, 'dashboard must have 2 svggraph widgets');
  assert.equal(count('problems'), 1, 'dashboard must have 1 problems widget');
});

test('dashboard item widgets reference the delta transition items', () => {
  const { lines } = readLines();
  const block = templateDashboardBlock(lines);

  const hosts = block.match(/host: '([^']+)'/g) || [];
  assert.ok(hosts.length > 0, 'dashboard widgets must reference items');
  assert.ok(
    hosts.every((host) => host === "host: 'Zyablik monitoring'"),
    'dashboard widgets must reference the template host'
  );

  for (const key of [
    'zyablik.backlog.delta',
    'zyablik.status.pending.delta',
    'zyablik.status.processing.delta',
    'zyablik.status.failed.delta'
  ]) {
    assert.ok(block.includes(`key: ${key}`), `dashboard item widgets must reference: ${key}`);
  }
});

test('all 4 item widgets sum SIMPLE_CHANGE deltas over the dashboard period', () => {
  // Семантика «переходы»: каждый item-виджет показывает сумму приростов
  // (SIMPLE_CHANGE) за период дашборда. Без агрегации SUM (aggregate_function=5)
  // виджет в режиме «Value» показывал бы только последний прирост, и фильтр
  // периода на него не влиял бы.
  const { lines } = readLines();
  const block = templateDashboardBlock(lines);

  const sums = block.match(/name: aggregate_function\n\s+value: '5'/g) || [];
  assert.equal(
    sums.length,
    4,
    'each item widget must have aggregate_function=5 (SUM) to follow the dashboard period'
  );
});

test('failed item widget shows a red threshold above zero', () => {
  const { lines } = readLines();
  const block = templateDashboardBlock(lines);

  assert.match(block, /thresholds\.0\.color\n\s+value: F63100/, 'failed widget must use a red threshold');
  assert.match(block, /thresholds\.0\.threshold\n\s+value: '1'/, 'failed widget must flag values above zero');
});

test('problems widget has a reference field', () => {
  const { lines } = readLines();
  const index = lines.findIndex((line) => line === '                - type: problems');
  assert.ok(index !== -1, 'dashboard must have a problems widget');

  let end = index + 1;
  while (end < lines.length && /^                /.test(lines[end])) {
    end++;
  }
  const problems = lines.slice(index, end).join('\n');

  assert.match(problems, /name: 'Проблемы'/, 'problems widget must have a title');
  assert.match(problems, /name: reference\n\s+value: [A-Z0-9]{5}/, 'problems widget must carry a unique reference');
});

test('calculated item backlog uses host-relative //key references', () => {
  // Zabbix не переписывает params calculated items из имени шаблона в имя
  // хоста при линковке (в отличие от триггеров): last(/Zyablik monitoring/...)
  // на хосте становится unsupported. Для шаблонов используется форма //key —
  // хост берётся у самого calculated item.
  const { lines } = readLines();
  const block = templateItemBlock(lines, 'zyablik.backlog');

  assert.match(block, /type: CALCULATED/, 'zyablik.backlog must be a calculated item');
  assert.match(
    block,
    /last\(\/\/zyablik\.status\.pending\)\+last\(\/\/zyablik\.status\.processing\)/,
    'zyablik.backlog must reference items via host-relative //key form'
  );
  assert.doesNotMatch(block, /\/Zyablik monitoring\//, 'zyablik.backlog must not reference the template host');
});

const DELTA_ITEMS = [
  ['zyablik.status.pending.delta', 'pending', 'DEPENDENT'],
  ['zyablik.status.processing.delta', 'processing', 'DEPENDENT'],
  ['zyablik.status.failed.delta', 'failed', 'DEPENDENT'],
  ['zyablik.backlog.delta', null, 'CALCULATED']
];

test('delta transition items apply SIMPLE_CHANGE preprocessing', () => {
  // Семантика «переходы» (SIMPLE_CHANGE): между опросами элемент хранит
  // прирост значения (current - previous). Первое значение задаёт базу и не
  // хранится. Zabbix отбрасывает отрицательные дельты (item_preproc.c),
  // поэтому сумма за период дашборда = сумма положительных переходов; для
  // монотонного счётчика failed - число новых переходов в failed.
  const { lines } = readLines();

  for (const [key, field, type] of DELTA_ITEMS) {
    const block = templateItemBlock(lines, key);
    assert.match(block, new RegExp(`type: ${type}`), `${key} must be ${type}`);
    assert.match(block, /value_type: FLOAT/, `${key} must be FLOAT - the signed numeric type for SIMPLE_CHANGE deltas (negative deltas are dropped by Zabbix, FLOAT is the consistent safe choice)`);
    assert.match(block, /type: SIMPLE_CHANGE/, `${key} must apply SIMPLE_CHANGE preprocessing`);
    if (field) {
      assert.match(block, /master_item:\n\s+key: zyablik.summary/, `${key} must master on zyablik.summary`);
      assert.match(
        block,
        new RegExp(`parameters:\\n\\s+- '\\$\\.${field}'`),
        `${key} must extract $.${field} via JSONPath`
      );
    } else {
      assert.match(
        block,
        /params: 'last\(\/\/zyablik\.backlog\)'/,
        `${key} must derive from the backlog level via host-relative //key params`
      );
    }
  }
});

test('delta transition items are not used by graphs or triggers (levels preserved)', () => {
  // Графики и триггеры завязаны на уровни zyablik.status.* / zyablik.backlog;
  // delta-элементы предназначены только для item-виджетов дашборда.
  const { lines } = readLines();
  const triggerIndex = lines.findIndex((line) => line === '  triggers:');
  const nonDashboard = lines.slice(triggerIndex).join('\n');

  for (const key of ['zyablik.status.pending.delta', 'zyablik.status.processing.delta', 'zyablik.status.failed.delta', 'zyablik.backlog.delta']) {
    assert.doesNotMatch(
      nonDashboard,
      new RegExp(`key: ${key.replace(/\./g, '\\.')}`),
      `${key} must not appear in graphs (they show levels)`
    );
  }
});
