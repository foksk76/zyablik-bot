// SPDX-License-Identifier: Apache-2.0
'use strict';

const MODULE_NAME = 'queue-monitor-config';
const DEFAULT_MONITOR_PORT = 9000;
const DEFAULT_RATE_LIMIT_RECIPIENT = 5;

function createQueueMonitorConfig(environment = process.env) {
  return {
    moduleName: MODULE_NAME,
    monitorEnabled: readBoolEnvValue(environment, 'MONITOR_ENABLED', false),
    monitorPort: readIntegerEnvValue(environment, 'MONITOR_PORT', DEFAULT_MONITOR_PORT, 1, 65535),
    metricsApiKey: readEnvValue(environment, 'METRICS_API_KEY'),
    idpIssuer: readEnvValue(environment, 'IDP_ISSUER'),
    idpClientId: readEnvValue(environment, 'IDP_CLIENT_ID'),
    idpClientSecret: readEnvValue(environment, 'IDP_CLIENT_SECRET'),
    idpRedirectUri: readEnvValue(environment, 'IDP_REDIRECT_URI'),
    sessionSecret: readEnvValue(environment, 'SESSION_SECRET')
  };
}

function readEnvValue(environment, key, fallback = '') {
  const value = environment && typeof environment[key] === 'string'
    ? environment[key].trim()
    : '';

  return value || fallback;
}

function readBoolEnvValue(environment, key, fallback = false) {
  const rawValue = readEnvValue(environment, key);

  if (!rawValue) {
    return fallback;
  }

  return rawValue.toLowerCase() === 'true';
}

function readIntegerEnvValue(environment, key, fallback, min, max) {
  const rawValue = readEnvValue(environment, key);

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${key} value: ${rawValue}`);
  }

  return value;
}

module.exports = {
  MODULE_NAME,
  DEFAULT_MONITOR_PORT,
  DEFAULT_RATE_LIMIT_RECIPIENT,
  createQueueMonitorConfig
};
