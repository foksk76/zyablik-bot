'use strict';

const moduleName = 'max-transport';

function createMaxTransport() {
  return {
    moduleName,
    status: 'scaffold',
    capabilities: {
      inboundWebhook: 'pending',
      outboundClient: 'pending',
      eventNormalizer: 'pending'
    },
    networkEnabled: false
  };
}

module.exports = {
  moduleName,
  createMaxTransport
};
