'use strict';

const { normalizeMaxEvent, getUpdateType } = require('../transports/max/event-normalizer');
const { createEventRouter } = require('./event-router');
const { createMaxOutboundClient } = require('../transports/max/outbound-client');
const { parseCommand } = require('./command-parser');
const { createCommandRegistry } = require('./command-registry');

const REPLY_UPDATE_TYPES = Object.freeze(['message_created', 'bot_added']);

const WELCOME_TEXT = 'Ready to help.';
const UNKNOWN_COMMAND_TEXT = 'Unknown command. Send /help for available commands.';

function createIdentityUpdateProcessor(options = {}) {
  const routeHandlers = options.routeHandlers || {};
  const router = options.router || createEventRouter(routeHandlers);
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

    if (updateType === 'bot_added') {
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
  createIdentityUpdateProcessor,
  REPLY_UPDATE_TYPES,
  WELCOME_TEXT,
  UNKNOWN_COMMAND_TEXT
};
