'use strict';

const { normalizeMaxEvent, getUpdateType } = require('../transports/max/event-normalizer');
const { createEventRouter } = require('./event-router');
const { createMaxOutboundClient } = require('../transports/max/outbound-client');

const REPLY_UPDATE_TYPES = Object.freeze(['message_created']);

function createIdentityUpdateProcessor(options = {}) {
  const routeHandlers = options.routeHandlers || {};
  const router = options.router || createEventRouter(routeHandlers);
  const outboundClient = options.outboundClient || createMaxOutboundClient(options.outboundClientOptions);

  return async function processUpdate(maxPayload) {
    const updateType = getUpdateType(maxPayload);

    if (!REPLY_UPDATE_TYPES.includes(updateType)) {
      return {
        mode: 'ignored',
        networkEnabled: false,
        updateType: updateType || 'unknown'
      };
    }

    const event = normalizeMaxEvent(maxPayload);
    const response = router.route(event, { route: 'identity' });
    const outbound = await outboundClient.send(response);

    return {
      mode: outbound.mode === 'live' ? 'live' : 'dry-run',
      networkEnabled: outbound.networkEnabled,
      event,
      response,
      outbound
    };
  };
}

module.exports = {
  createIdentityUpdateProcessor,
  REPLY_UPDATE_TYPES
};
