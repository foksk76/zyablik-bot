'use strict';

const { normalizeMaxEvent } = require('../transports/max');
const { handleIdentityEvent } = require('../plugins/identity');
const { createEventRouter } = require('./event-router');

function runMaxIdentityDryRun(maxPayload) {
  const event = normalizeMaxEvent(maxPayload);
  const router = createEventRouter({
    identity: handleIdentityEvent
  });

  return {
    mode: 'dry-run',
    networkEnabled: false,
    response: router.route(event, { route: 'identity' })
  };
}

module.exports = {
  runMaxIdentityDryRun
};
