// SPDX-License-Identifier: Apache-2.0
'use strict';

const moduleName = 'config';
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_MAX_TRANSPORT_MODE = 'long_polling';
const DEFAULT_MAX_POLL_LIMIT = 100;
const DEFAULT_MAX_POLL_TIMEOUT_SECONDS = 30;
const DEFAULT_MAX_POLL_TYPES = Object.freeze(['message_created', 'bot_started', 'bot_added']);
const DEFAULT_QUEUE_MAX_ATTEMPTS = 5;
const DEFAULT_QUEUE_INTERVAL_MS = 5000;
const DEFAULT_QUEUE_BATCH_SIZE = 10;
const DEFAULT_QUEUE_BACKOFF_BASE = 2;
const DEFAULT_QUEUE_BACKOFF_MAX = 300;
const DEFAULT_RATE_LIMIT_GLOBAL = 25;
const DEFAULT_RATE_LIMIT_RECIPIENT = 5;
const DEFAULT_INGRESS_PORT = 8443;
const MAX_TRANSPORT_MODES = new Set(['long_polling', 'webhook']);
const CONFIG_VALIDATION_ERROR_CODE = 'CONFIG_VALIDATION_ERROR';
const TRANSPORT_NOT_IMPLEMENTED_ERROR_CODE = 'TRANSPORT_NOT_IMPLEMENTED';
const WEBHOOK_NOT_IMPLEMENTED_MESSAGE = 'Не реализовано: transport mode webhook';
const INVALID_LIVE_RUNTIME_MESSAGE = 'Invalid MAX live runtime configuration';

function createBotPlatformConfig(environment = process.env) {
  const maxTransportMode = readTransportMode(environment, 'MAX_TRANSPORT_MODE', DEFAULT_MAX_TRANSPORT_MODE);

  return {
    moduleName,
    status: 'available',
    maxApiUrl: readEnvValue(environment, 'MAX_API_URL'),
    maxBotToken: readEnvValue(environment, 'MAX_BOT_TOKEN'),
    httpProxy: readEnvValue(environment, 'MAX_HTTP_PROXY'),
    logLevel: readEnvValue(environment, 'MAX_LOG_LEVEL', DEFAULT_LOG_LEVEL),
    maxTransportMode,
    maxPollLimit: readIntegerEnvValue(environment, 'MAX_POLL_LIMIT', DEFAULT_MAX_POLL_LIMIT, 1, 1000),
    maxPollTimeoutSeconds: readIntegerEnvValue(
      environment,
      'MAX_POLL_TIMEOUT_SECONDS',
      DEFAULT_MAX_POLL_TIMEOUT_SECONDS,
      0,
      90
    ),
    maxPollTypes: readListEnvValue(environment, 'MAX_POLL_TYPES', DEFAULT_MAX_POLL_TYPES),
    queueEnabled: readBoolEnvValue(environment, 'QUEUE_ENABLED', false),
    queueMaxAttempts: readIntegerEnvValue(environment, 'QUEUE_MAX_ATTEMPTS', DEFAULT_QUEUE_MAX_ATTEMPTS, 1, 100),
    queueIntervalMs: readIntegerEnvValue(environment, 'QUEUE_INTERVAL_MS', DEFAULT_QUEUE_INTERVAL_MS, 100, 60000),
    queueBatchSize: readIntegerEnvValue(environment, 'QUEUE_BATCH_SIZE', DEFAULT_QUEUE_BATCH_SIZE, 1, 1000),
    queueBackoffBase: readIntegerEnvValue(environment, 'QUEUE_BACKOFF_BASE', DEFAULT_QUEUE_BACKOFF_BASE, 2, 10),
    queueBackoffMax: readIntegerEnvValue(environment, 'QUEUE_BACKOFF_MAX', DEFAULT_QUEUE_BACKOFF_MAX, 10, 3600),
    rateLimitEnabled: readBoolEnvValue(environment, 'RATE_LIMIT_ENABLED', true),
    rateLimitGlobal: readIntegerEnvValue(environment, 'RATE_LIMIT_GLOBAL', DEFAULT_RATE_LIMIT_GLOBAL, 1, 1000),
    rateLimitRecipient: readIntegerEnvValue(environment, 'RATE_LIMIT_RECIPIENT', DEFAULT_RATE_LIMIT_RECIPIENT, 1, 100),
    ingressEnabled: readBoolEnvValue(environment, 'INGRESS_ENABLED', false),
    ingressPort: readIntegerEnvValue(environment, 'INGRESS_PORT', DEFAULT_INGRESS_PORT, 1, 65535),
    idpIssuer: readEnvValue(environment, 'IDP_ISSUER'),
    idpAudience: readEnvValue(environment, 'IDP_AUDIENCE'),
    jwtClaimName: readEnvValue(environment, 'JWT_CLAIM_NAME'),
    jwtClaimValue: readEnvValue(environment, 'JWT_CLAIM_VALUE'),
    logAudit: readBoolEnvValue(environment, 'LOG_AUDIT', false),
    logTrace: readBoolEnvValue(environment, 'LOG_TRACE', true)
  };
}

function createLiveRuntimeConfig(environment = process.env) {
  const config = createBotPlatformConfig(environment);

  if (config.maxTransportMode === 'webhook') {
    return {
      moduleName,
      status: 'available',
      mode: 'webhook',
      error: createConfigError(TRANSPORT_NOT_IMPLEMENTED_ERROR_CODE, WEBHOOK_NOT_IMPLEMENTED_MESSAGE)
    };
  }

  const missingFields = [];

  if (config.maxApiUrl === '') {
    missingFields.push('MAX_API_URL');
  }

  if (config.maxBotToken === '') {
    missingFields.push('MAX_BOT_TOKEN');
  }

  if (missingFields.length > 0) {
    throw createConfigError(CONFIG_VALIDATION_ERROR_CODE, INVALID_LIVE_RUNTIME_MESSAGE, {
      missing: missingFields
    });
  }

  return {
    moduleName,
    status: 'available',
    mode: 'long_polling',
    maxApiUrl: config.maxApiUrl,
    maxBotToken: config.maxBotToken,
    httpProxy: config.httpProxy,
    logLevel: config.logLevel,
    maxTransportMode: config.maxTransportMode,
    maxPollLimit: config.maxPollLimit,
    maxPollTimeoutSeconds: config.maxPollTimeoutSeconds,
    maxPollTypes: config.maxPollTypes
  };
}

function readBoolEnvValue(environment, key, fallback = false) {
  const rawValue = readEnvValue(environment, key);

  if (!rawValue) {
    return fallback;
  }

  return rawValue.toLowerCase() === 'true';
}

function readEnvValue(environment, key, fallback = '') {
  const value = environment && typeof environment[key] === 'string'
    ? environment[key].trim()
    : '';

  return value || fallback;
}

function readTransportMode(environment, key, fallback = DEFAULT_MAX_TRANSPORT_MODE) {
  const rawValue = readEnvValue(environment, key, fallback).toLowerCase();

  if (!MAX_TRANSPORT_MODES.has(rawValue)) {
    throw new Error(`Invalid ${key} value: ${rawValue}`);
  }

  return rawValue;
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

function readListEnvValue(environment, key, fallback) {
  const rawValue = readEnvValue(environment, key);

  if (!rawValue) {
    return [...fallback];
  }

  const values = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    return [...fallback];
  }

  return values;
}

function createConfigError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;

  if (details && Object.keys(details).length > 0) {
    error.details = details;
  }

  return error;
}

module.exports = {
  moduleName,
  createBotPlatformConfig,
  createLiveRuntimeConfig,
  DEFAULT_MAX_TRANSPORT_MODE,
  DEFAULT_MAX_POLL_LIMIT,
  DEFAULT_MAX_POLL_TIMEOUT_SECONDS,
  DEFAULT_MAX_POLL_TYPES,
  DEFAULT_QUEUE_MAX_ATTEMPTS,
  DEFAULT_QUEUE_INTERVAL_MS,
  DEFAULT_QUEUE_BATCH_SIZE,
  DEFAULT_QUEUE_BACKOFF_BASE,
  DEFAULT_QUEUE_BACKOFF_MAX,
  DEFAULT_RATE_LIMIT_GLOBAL,
  DEFAULT_RATE_LIMIT_RECIPIENT,
  DEFAULT_INGRESS_PORT,
  MAX_TRANSPORT_MODES,
  CONFIG_VALIDATION_ERROR_CODE,
  TRANSPORT_NOT_IMPLEMENTED_ERROR_CODE,
  WEBHOOK_NOT_IMPLEMENTED_MESSAGE
};
