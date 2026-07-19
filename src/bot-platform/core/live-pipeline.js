// SPDX-License-Identifier: Apache-2.0
'use strict';

const { normalizeMaxEvent, getUpdateType } = require('../transports/max/event-normalizer');
const { createMaxOutboundClient } = require('../transports/max/outbound-client');
const { createCommandRegistry } = require('./command-registry');
const { buildPipelineResponse } = require('./pipeline-dispatch');
const { REPLY_UPDATE_TYPES } = require('./pipeline-constants');

function createIdentityUpdateProcessor(options = {}) {
    const outboundClient = options.outboundClient || createMaxOutboundClient(options.outboundClientOptions);
    const commandRegistry = options.commandRegistry || createCommandRegistry({
        identityHandler: options.identityHandler || null
    });
    const queueStore = options.queueStore || null;
    const queueEnabled = options.queueEnabled === true && queueStore !== null;

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
        const response = buildPipelineResponse(event, updateType, commandRegistry);

        if (queueEnabled) {
            const { id } = queueStore.enqueue({ payload: response, source: 'max' });

            return {
                mode: 'queued',
                networkEnabled: false,
                event,
                response,
                outbound: { mode: 'queued', queueId: id }
            };
        }

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
    createIdentityUpdateProcessor
};
