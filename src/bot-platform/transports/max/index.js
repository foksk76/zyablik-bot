'use strict';

const { normalizeMaxEvent } = require('./event-normalizer');
const { createMaxOutboundClient, buildMaxOutboundPayload } = require('./outbound-client');
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
  createMaxInboundWebhookHandler,
  createMaxOutboundClient,
  buildMaxOutboundPayload
};
