// SPDX-License-Identifier: Apache-2.0
'use strict';

const { normalizeMaxEvent, getUpdateType } = require('../transports/max/event-normalizer');
const { createMaxOutboundClient } = require('../transports/max/outbound-client');
const { createCommandRegistry } = require('./command-registry');
const { buildPipelineResponse } = require('./pipeline-dispatch');
const { REPLY_UPDATE_TYPES } = require('./pipeline-constants');

async function runMaxIdentityDryRun(maxPayload, options = {}) {
    const outboundClient = options.outboundClient || createMaxOutboundClient(options.outboundClientOptions);
    const commandRegistry = options.commandRegistry || createCommandRegistry({
        identityHandler: options.identityHandler || null
    });
    const updateType = getUpdateType(maxPayload);

    if (!REPLY_UPDATE_TYPES.includes(updateType)) {
        return {
            mode: 'ignored',
            networkEnabled: false,
            updateType: updateType || 'unknown'
        };
    }

    const event = normalizeMaxEvent(maxPayload);
    const response = buildPipelineResponse(event, updateType, commandRegistry);

    return {
        mode: 'dry-run',
        networkEnabled: false,
        event,
        response,
        outbound: await outboundClient.send(response)
    };
}

module.exports = {
    runMaxIdentityDryRun
};
