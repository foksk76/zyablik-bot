'use strict';

const { formatIdentityResponse } = require('./formatter');
const { handleIdentityEvent } = require('./handler');

const moduleName = 'identity-plugin';

function createIdentityPlugin() {
  return {
    moduleName,
    status: 'scaffold',
    capabilities: {
      userRecipient: 'available',
      chatRecipient: 'available',
      responseFormatter: 'available'
    }
  };
}

module.exports = {
  moduleName,
  createIdentityPlugin,
  formatIdentityResponse,
  handleIdentityEvent
};
