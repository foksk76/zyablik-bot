// SPDX-License-Identifier: Apache-2.0
'use strict';

const { normalizeMaxEvent, getUpdateType } = require('./event-normalizer');
const {
  createMaxOutboundClient,
  buildMaxOutboundPayload,
  buildMaxOutboundRequest,
  MAX_API_ERROR_CODE
} = require('./outbound-client');
const {
  createMaxInboundUpdatesClient,
  buildMaxInboundUpdatesRequest,
  normalizeUpdatesResponse
} = require('./inbound-updates');
const { createMaxInboundWebhookHandler } = require('./inbound-webhook');

const moduleName = 'max-transport';

function createMaxTransport(options = {}) {
  const transportMode = options.transportMode || 'long_polling';

  return {
    moduleName,
    status: 'scaffold',
    transportMode,
    capabilities: {
      inboundWebhook: 'available',
      outboundClient: 'available',
      eventNormalizer: 'available',
      longPolling: transportMode === 'long_polling' ? 'preferred' : 'available',
      webhook: transportMode === 'webhook' ? 'preferred' : 'available'
    },
    networkEnabled: false
  };
}

module.exports = {
  moduleName,
  createMaxTransport,
  normalizeMaxEvent,
  getUpdateType,
  createMaxInboundWebhookHandler,
  createMaxOutboundClient,
  buildMaxOutboundPayload,
  buildMaxOutboundRequest,
  createMaxInboundUpdatesClient,
  buildMaxInboundUpdatesRequest,
  normalizeUpdatesResponse,
  MAX_API_ERROR_CODE
};
