'use strict';

const { normalizeMaxEvent } = require('../transports/max/event-normalizer');
const { createMaxOutboundClient } = require('../transports/max/outbound-client');
const { createEventRouter } = require('./event-router');

async function runMaxIdentityDryRun(maxPayload, routeHandlers = {}) {
  const event = normalizeMaxEvent(maxPayload);
  const router = createEventRouter(routeHandlers);

  const response = router.route(event, { route: 'identity' });
  const outboundClient = createMaxOutboundClient();

  return {
    mode: 'dry-run',
    networkEnabled: false,
    response,
    outbound: await outboundClient.send(response)
  };
}

module.exports = {
  runMaxIdentityDryRun
};
