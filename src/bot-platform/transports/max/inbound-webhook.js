'use strict';

const { runMaxIdentityDryRun } = require('../../core/dry-run-pipeline');

const moduleName = 'max-inbound-webhook';

function createMaxInboundWebhookHandler() {
  return {
    moduleName,
    status: 'available',
    networkEnabled: false,
    async handle(request) {
      const payload = readRequestPayload(request);

      return {
        statusCode: 200,
        mode: 'dry-run',
        networkEnabled: false,
        ...await runMaxIdentityDryRun(payload)
      };
    }
  };
}

function readRequestPayload(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Invalid MAX inbound request');
  }

  const payload = Object.prototype.hasOwnProperty.call(request, 'body')
    ? request.body
    : request;

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid MAX inbound request');
  }

  return payload;
}

module.exports = {
  moduleName,
  createMaxInboundWebhookHandler
};
