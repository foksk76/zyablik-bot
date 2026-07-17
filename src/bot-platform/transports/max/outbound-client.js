'use strict';

const { buildSafeTransportErrorDetails } = require('./error-details');
const { normalizeHttpResponse, createLogger } = require('./shared-helpers');
const { RECIPIENT_TYPE_MAP } = require('../../core/pipeline-constants');

const moduleName = 'max-outbound-client';
const MAX_API_ERROR_CODE = 'MAX_API_ERROR';
const DEFAULT_NOTIFY = true;
const DEFAULT_FORMAT = 'markdown';

function createMaxOutboundClient(options = {}) {
  const logger = createLogger(options.logger);
  const apiUrl = typeof options.apiUrl === 'string' && options.apiUrl.trim()
    ? options.apiUrl.trim()
    : '<synthetic-max-api-url>';
  const token = typeof options.token === 'string' && options.token.trim()
    ? options.token.trim()
    : '';
  const httpClient = createHttpClient(options.httpClient);
  const networkEnabled = options.networkEnabled === true && httpClient !== null;

  return {
    moduleName,
    status: 'available',
    networkEnabled,
    async send(response) {
      const payload = buildMaxOutboundPayload(response);
      const dryRunRequest = {
        method: 'POST',
        url: apiUrl,
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload
      };

      logger.info('prepared MAX outbound request', {
        recipientType: payload.recipientType,
        networkEnabled
      });

      if (!networkEnabled) {
        return {
          mode: 'dry-run',
          networkEnabled: false,
          request: dryRunRequest,
          payload
        };
      }

      try {
        const request = buildMaxOutboundRequest(response, payload, {
          apiUrl,
          token
        });
        const httpResponse = await httpClient.post(request);
        const normalizedResponse = normalizeHttpResponse(httpResponse);

        if (normalizedResponse.statusCode < 200 || normalizedResponse.statusCode >= 300) {
          throw createMaxApiError(normalizedResponse.statusCode);
        }

        logger.info('sent MAX outbound response', {
          statusCode: normalizedResponse.statusCode,
          recipientType: payload.recipientType,
          networkEnabled: true
        });

        return {
          mode: 'live',
          networkEnabled: true,
          request,
          response: normalizedResponse,
          payload
        };
      } catch (error) {
        throw normalizeMaxApiError(error);
      }
    }
  };
}

function buildMaxOutboundRequest(response, payload, options = {}) {
  const apiUrl = typeof options.apiUrl === 'string' && options.apiUrl.trim()
    ? options.apiUrl.trim()
    : '<synthetic-max-api-url>';
  const token = typeof options.token === 'string' && options.token.trim()
    ? options.token.trim()
    : '';
  const requestUrl = buildRecipientUrl(apiUrl, payload.recipientType, payload.to);
  const body = buildLiveOutboundBody(response);
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers.Authorization = token;
  }

  return {
    method: 'POST',
    url: requestUrl,
    headers,
    body
  };
}

function buildLiveOutboundBody(identityResponse) {
  return {
    text: typeof identityResponse.text === 'string' ? identityResponse.text : '',
    notify: typeof identityResponse.notify === 'boolean' ? identityResponse.notify : DEFAULT_NOTIFY,
    format: typeof identityResponse.format === 'string' && identityResponse.format.trim()
      ? identityResponse.format.trim().toLowerCase()
      : DEFAULT_FORMAT
  };
}

function buildRecipientUrl(apiUrl, recipientType, to) {
  const url = new URL(apiUrl);

  url.searchParams.set(recipientType, to);

  return url.toString();
}

function createMaxApiError(statusCode, extraDetails = {}) {
  const error = new Error('MAX API request failed');
  error.code = MAX_API_ERROR_CODE;
  error.details = { ...extraDetails };

  if (Number.isInteger(statusCode) && statusCode > 0) {
    error.details.statusCode = statusCode;
  }

  return error;
}

function normalizeMaxApiError(error) {
  if (error && typeof error === 'object' && error.code === MAX_API_ERROR_CODE) {
    return error;
  }

  if (error && typeof error === 'object' && Number.isInteger(error.statusCode)) {
    return createMaxApiError(error.statusCode);
  }

  if (error && typeof error === 'object' && error.message) {
    const normalized = new Error('MAX API request failed');
    normalized.code = MAX_API_ERROR_CODE;
    normalized.details = buildSafeTransportErrorDetails(error, {
      reason: 'transport failure'
    });

    return normalized;
  }

  return createMaxApiError(0);
}

function createHttpClient(httpClient) {
  if (httpClient && typeof httpClient.post === 'function') {
    return httpClient;
  }

  if (typeof httpClient === 'function') {
    return {
      post: httpClient
    };
  }

  return null;
}

function buildMaxOutboundPayload(response) {
  if (!response || typeof response.kind !== 'string') {
    throw new Error('Invalid response: missing kind');
  }

  if (response.kind === 'identity') {
    return buildIdentityPayload(response);
  }

  if (response.kind === 'text') {
    return buildTextPayload(response);
  }

  throw new Error('Invalid response: unknown kind');
}

function buildIdentityPayload(response) {
  if (!response.zabbix) {
    throw new Error('Invalid identity response: missing zabbix');
  }

  const recipientType = response.zabbix.recipientType;
  const to = response.zabbix.to;

  if (!recipientType || !to) {
    throw new Error('Missing MAX outbound payload fields');
  }

  return {
    recipientType,
    to,
    text: typeof response.text === 'string' ? response.text : ''
  };
}

function buildTextPayload(response) {
  if (!response.recipient || !response.recipient.kind || !response.recipient.value) {
    throw new Error('Invalid text response: missing recipient');
  }

  const recipientType = RECIPIENT_TYPE_MAP[response.recipient.kind];

  if (!recipientType) {
    throw new Error('Invalid text response: unknown recipient kind');
  }

  return {
    recipientType,
    to: response.recipient.value,
    text: typeof response.text === 'string' ? response.text : ''
  };
}

module.exports = {
  moduleName,
  createMaxOutboundClient,
  buildMaxOutboundPayload,
  buildMaxOutboundRequest,
  MAX_API_ERROR_CODE
};
