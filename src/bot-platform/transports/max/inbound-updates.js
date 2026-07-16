'use strict';

const { CONFIG_VALIDATION_ERROR_CODE } = require('../../core/config');
const { MAX_API_ERROR_CODE } = require('./outbound-client');
const { buildSafeTransportErrorDetails } = require('./error-details');
const { normalizeHttpResponse, createLogger } = require('./shared-helpers');

const moduleName = 'max-inbound-updates-client';
const DEFAULT_API_URL = 'https://platform-api2.max.ru';
const DEFAULT_LIMIT = 100;
const DEFAULT_TIMEOUT_SECONDS = 30;
const DEFAULT_TYPES = Object.freeze(['message_created', 'bot_started', 'bot_added']);

function createMaxInboundUpdatesClient(options = {}) {
  const logger = createLogger(options.logger);
  const apiUrl = typeof options.apiUrl === 'string' && options.apiUrl.trim()
    ? options.apiUrl.trim()
    : DEFAULT_API_URL;
  const token = typeof options.token === 'string' && options.token.trim()
    ? options.token.trim()
    : '';
  const httpClient = createHttpClient(options.httpClient);
  const networkEnabled = options.networkEnabled !== false && httpClient !== null;
  const state = {
    marker: normalizeMarker(options.marker)
  };
  const limit = normalizeLimit(options.limit);
  const timeoutSeconds = normalizeTimeoutSeconds(options.timeoutSeconds);
  const types = normalizeTypes(options.types);

  return {
    moduleName,
    status: 'available',
    networkEnabled,
    state,
    ack(marker) {
      state.marker = normalizeMarker(marker);
      return state.marker;
    },
    async poll() {
      if (networkEnabled && !token) {
        throw createConfigError('Missing MAX_BOT_TOKEN for live inbound updates');
      }

      const request = buildMaxInboundUpdatesRequest({
        apiUrl,
        token,
        limit,
        timeoutSeconds,
        marker: state.marker,
        types
      });

      if (!networkEnabled) {
        return {
          mode: 'dry-run',
          networkEnabled: false,
          request,
          updates: [],
          marker: state.marker
        };
      }

      try {
        const response = normalizeHttpResponse(await httpClient.get(request));
        if (response.statusCode < 200 || response.statusCode >= 300) {
          throw createMaxApiError(response.statusCode);
        }

        const result = normalizeUpdatesResponse(response.body);

        if (result.updates.length > 0) {
          logger.info('received MAX inbound updates', {
            statusCode: response.statusCode,
            updatesCount: result.updates.length,
            marker: result.marker,
            networkEnabled: true
          });
        }

        return {
          mode: 'live',
          networkEnabled: true,
          request,
          response,
          updates: result.updates,
          marker: result.marker
        };
      } catch (error) {
        throw normalizeMaxInboundError(error);
      }
    }
  };
}

function buildMaxInboundUpdatesRequest(options = {}) {
  const apiUrl = typeof options.apiUrl === 'string' && options.apiUrl.trim()
    ? options.apiUrl.trim()
    : DEFAULT_API_URL;
  const token = typeof options.token === 'string' && options.token.trim()
    ? options.token.trim()
    : '';
  const limit = normalizeLimit(options.limit);
  const timeoutSeconds = normalizeTimeoutSeconds(options.timeoutSeconds);
  const marker = normalizeMarker(options.marker);
  const types = normalizeTypes(options.types);

  const url = new URL('/updates', ensureBaseUrl(apiUrl));
  const searchParams = url.searchParams;

  searchParams.set('limit', String(limit));
  searchParams.set('timeout', String(timeoutSeconds));
  searchParams.set('types', types.join(','));

  if (marker !== null) {
    searchParams.set('marker', String(marker));
  }

  return {
    method: 'GET',
    url: url.toString(),
    headers: token ? { Authorization: token } : {}
  };
}

function normalizeUpdatesResponse(body) {
  const payload = normalizeResponseBody(body);

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw createMaxApiError(0, 'invalid updates response');
  }

  if (!Array.isArray(payload.updates)) {
    throw createMaxApiError(0, 'invalid updates response');
  }

  const updates = payload.updates.map((update) => {
    if (!update || typeof update !== 'object' || Array.isArray(update)) {
      throw createMaxApiError(0, 'invalid updates response');
    }

    return update;
  });

  return {
    updates,
    marker: normalizeResponseMarker(payload.marker)
  };
}

function normalizeResponseBody(body) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      throw createMaxApiError(0, 'invalid updates response');
    }
  }

  return body;
}

function normalizeResponseMarker(marker) {
  if (marker === null || marker === undefined) {
    return null;
  }

  if (Number.isInteger(marker)) {
    return marker;
  }

  throw createMaxApiError(0, 'invalid updates response');
}

function normalizeMaxInboundError(error) {
  if (error && typeof error === 'object' && error.code === MAX_API_ERROR_CODE) {
    return error;
  }

  if (error && typeof error === 'object' && Number.isInteger(error.statusCode)) {
    return createMaxApiError(error.statusCode);
  }

  if (error && typeof error === 'object' && error.message) {
    return createMaxApiError(0, 'transport failure', buildSafeTransportErrorDetails(error));
  }

  return createMaxApiError(0, 'transport failure');
}

function createMaxApiError(statusCode, reason, extraDetails = {}) {
  const error = new Error('MAX API request failed');
  error.code = MAX_API_ERROR_CODE;
  error.details = { ...extraDetails };

  if (Number.isInteger(statusCode) && statusCode > 0) {
    error.details.statusCode = statusCode;
  }

  if (reason) {
    error.details.reason = reason;
  }

  return error;
}

function createConfigError(message) {
  const error = new Error(message);
  error.code = CONFIG_VALIDATION_ERROR_CODE;
  return error;
}

function ensureBaseUrl(apiUrl) {
  return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

function normalizeLimit(value) {
  if (Number.isInteger(value) && value >= 1 && value <= 1000) {
    return value;
  }

  return DEFAULT_LIMIT;
}

function normalizeTimeoutSeconds(value) {
  if (Number.isInteger(value) && value >= 0 && value <= 90) {
    return value;
  }

  return DEFAULT_TIMEOUT_SECONDS;
}

function normalizeMarker(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (Number.isInteger(value)) {
    return value;
  }

  return null;
}

function normalizeTypes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [...DEFAULT_TYPES];
  }

  const types = value
    .filter((type) => typeof type === 'string')
    .map((type) => type.trim())
    .filter((type) => type.length > 0);

  return types.length > 0 ? types : [...DEFAULT_TYPES];
}

function createHttpClient(httpClient) {
  if (httpClient && typeof httpClient.get === 'function') {
    return httpClient;
  }

  if (typeof httpClient === 'function') {
    return {
      get: httpClient
    };
  }

  return null;
}

module.exports = {
  moduleName,
  DEFAULT_API_URL,
  DEFAULT_LIMIT,
  DEFAULT_TIMEOUT_SECONDS,
  DEFAULT_TYPES,
  createMaxInboundUpdatesClient,
  buildMaxInboundUpdatesRequest,
  normalizeUpdatesResponse
};
