'use strict';

const moduleName = 'config';
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_MAX_TRANSPORT_MODE = 'long_polling';
const MAX_TRANSPORT_MODES = new Set(['long_polling', 'webhook']);

function createBotPlatformConfig(environment = process.env) {
  const maxTransportMode = readTransportMode(environment, 'MAX_TRANSPORT_MODE', DEFAULT_MAX_TRANSPORT_MODE);

  return {
    moduleName,
    status: 'available',
    maxApiUrl: readEnvValue(environment, 'MAX_API_URL'),
    maxBotToken: readEnvValue(environment, 'MAX_BOT_TOKEN'),
    httpProxy: readEnvValue(environment, 'MAX_HTTP_PROXY'),
    logLevel: readEnvValue(environment, 'MAX_LOG_LEVEL', DEFAULT_LOG_LEVEL),
    maxTransportMode
  };
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

module.exports = {
  moduleName,
  createBotPlatformConfig,
  DEFAULT_MAX_TRANSPORT_MODE,
  MAX_TRANSPORT_MODES
};
