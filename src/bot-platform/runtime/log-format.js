// SPDX-License-Identifier: Apache-2.0
'use strict';

const IMPORTANT_CONTEXT_KEYS = [
  'mode',
  'networkEnabled',
  'polls',
  'updates',
  'updatesCount',
  'results',
  'statusCode',
  'recipientType',
  'error',
  'code',
  'reason',
  'causeCode',
  'causeMessage',
  'causeHost'
];

function formatRuntimeLogLine(message, context) {
  const fields = flattenContext(context);
  const parts = [String(message)];

  for (const key of IMPORTANT_CONTEXT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      parts.push(`${key}=${formatLogValue(fields[key])}`);
    }
  }

  return parts.join(' ');
}

function flattenContext(context) {
  const fields = {};

  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return fields;
  }

  for (const [key, value] of Object.entries(context)) {
    if (key === 'details' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [detailKey, detailValue] of Object.entries(value)) {
        fields[detailKey] = detailValue;
      }
      continue;
    }

    fields[key] = value;
  }

  return fields;
}

function formatLogValue(value) {
  if (typeof value === 'string') {
    return /^[A-Za-z0-9_.:/@-]+$/.test(value) ? value : JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  return JSON.stringify(value);
}

function createConsoleRuntimeLogger(target = console) {
  return {
    info(message, context) {
      writeFormattedLog(target, 'info', message, context);
    },
    warn(message, context) {
      writeFormattedLog(target, 'warn', message, context);
    },
    error(message, context) {
      writeFormattedLog(target, 'error', message, context);
    }
  };
}

function writeFormattedLog(target, level, message, context) {
  const method = typeof target[level] === 'function' ? level : 'log';

  target[method](formatRuntimeLogLine(message, context));
}

module.exports = {
  createConsoleRuntimeLogger,
  formatRuntimeLogLine
};
