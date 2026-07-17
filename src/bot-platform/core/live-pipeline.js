'use strict';

const { normalizeMaxEvent, getUpdateType } = require('../transports/max/event-normalizer');
const { createMaxOutboundClient } = require('../transports/max/outbound-client');
const { parseCommand } = require('./command-parser');
const { createCommandRegistry } = require('./command-registry');
const { REPLY_UPDATE_TYPES, WELCOME_TEXT, UNKNOWN_COMMAND_TEXT } = require('./pipeline-constants');

function createIdentityUpdateProcessor(options = {}) {
  const outboundClient = options.outboundClient || createMaxOutboundClient(options.outboundClientOptions);
  const commandRegistry = options.commandRegistry || createCommandRegistry({
    identityHandler: options.identityHandler || null
  });

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

    if (updateType === 'bot_added' || updateType === 'bot_started') {
      const response = {
        kind: 'text',
        text: WELCOME_TEXT,
        recipient: event.recipient
      };
      const outbound = await outboundClient.send(response);

      return {
        mode: outbound.mode === 'live' ? 'live' : 'dry-run',
        networkEnabled: outbound.networkEnabled,
        event,
        response,
        outbound
      };
    }

    const parsed = parseCommand(event.message.text);

    if (parsed) {
      const entry = commandRegistry.lookup(parsed.command);

      if (entry) {
        const response = entry.handler(event);
        const outbound = await outboundClient.send(response);

        return {
          mode: outbound.mode === 'live' ? 'live' : 'dry-run',
          networkEnabled: outbound.networkEnabled,
          event,
          response,
          outbound
        };
      }
    }

    const response = {
      kind: 'text',
      text: UNKNOWN_COMMAND_TEXT,
      recipient: event.recipient
    };
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
