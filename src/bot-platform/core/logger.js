// SPDX-License-Identifier: Apache-2.0
'use strict';

const moduleName = 'logger';
const REDACTION = '[redacted]';
const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|api[-_]?key|cookie)/i;
const CONFIG_SECRET_KEYS = new Set([
  'maxBotToken',
  'token',
  'secret',
  'password',
  'authorization',
  'apiKey',
  'apiToken'
]);

function createSafeLogger(options = {}) {
  const writeEntry = typeof options.write === 'function' ? options.write : () => {};
  const secrets = buildSecretList(options.secrets, options.config);

  function emit(level, message, context) {
    const entry = {
      moduleName,
      status: 'available',
      level,
      message: maskText(message, secrets),
      context: maskValue(context, secrets)
    };

    writeEntry(entry);
    return entry;
  }

  return {
    moduleName,
    status: 'available',
    log: (message, context) => emit('info', message, context),
    debug: (message, context) => emit('debug', message, context),
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context)
  };
}

function buildSecretList(explicitSecrets = [], config = {}) {
  const secretValues = [];

  if (Array.isArray(explicitSecrets)) {
    for (const secret of explicitSecrets) {
      if (typeof secret === 'string' && secret.trim()) {
        secretValues.push(secret.trim());
      }
    }
  }

  if (config && typeof config === 'object') {
    for (const [key, value] of Object.entries(config)) {
      if (CONFIG_SECRET_KEYS.has(key) && typeof value === 'string' && value.trim()) {
        secretValues.push(value.trim());
      }
    }
  }

  return Array.from(new Set(secretValues));
}

function maskText(value, secrets) {
  let masked = String(value);

  for (const secret of secrets) {
    masked = masked.split(secret).join(REDACTION);
  }

  return masked;
}

function maskValue(value, secrets, seenValues = new WeakSet()) {
  if (typeof value === 'string') {
    return maskText(value, secrets);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (seenValues.has(value)) {
    return REDACTION;
  }

  seenValues.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item, secrets, seenValues));
  }

  const maskedObject = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      maskedObject[key] = REDACTION;
      continue;
    }

    maskedObject[key] = maskValue(nestedValue, secrets, seenValues);
  }

  return maskedObject;
}

function formatLogLine({ ts, level, module, reqId, action, context }) {
  const moduleStr = reqId ? `${module}:${reqId}` : module;
  let line = ts
    ? `[${ts}] [${level}] [${moduleStr}] ${action}`
    : `[${level}] [${moduleStr}] ${action}`;

  if (context && typeof context === 'object' && Object.keys(context).length > 0) {
    line += ` ${JSON.stringify(context)}`;
  }

  return line;
}

module.exports = {
  moduleName,
  createSafeLogger,
  formatLogLine,
  maskText,
  maskValue
};
