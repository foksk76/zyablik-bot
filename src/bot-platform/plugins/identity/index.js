'use strict';

const moduleName = 'identity-plugin';

function createIdentityPlugin() {
  return {
    moduleName,
    status: 'scaffold',
    capabilities: {
      userRecipient: 'pending',
      chatRecipient: 'pending',
      responseFormatter: 'pending'
    }
  };
}

module.exports = {
  moduleName,
  createIdentityPlugin
};
