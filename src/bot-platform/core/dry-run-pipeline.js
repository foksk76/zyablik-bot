'use strict';

const { normalizeMaxEvent } = require('../transports/max/event-normalizer');
const { createMaxOutboundClient } = require('../transports/max/outbound-client');
const { handleIdentityEvent } = require('../plugins/identity');
const { createEventRouter } = require('./event-router');

async function runMaxIdentityDryRun(maxPayload) {
  const event = normalizeMaxEvent(maxPayload);
  const router = createEventRouter({
    identity: handleIdentityEvent
  });

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
