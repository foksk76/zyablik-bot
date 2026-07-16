'use strict';

const { normalizeMaxEvent, getUpdateType } = require('../transports/max/event-normalizer');
const { createMaxOutboundClient } = require('../transports/max/outbound-client');
const { parseCommand } = require('./command-parser');
const { createCommandRegistry } = require('./command-registry');

const REPLY_UPDATE_TYPES = Object.freeze(['message_created', 'bot_added']);
const WELCOME_TEXT = 'Ready to help.';
const UNKNOWN_COMMAND_TEXT = 'Unknown command. Send /help for available commands.';

async function runMaxIdentityDryRun(maxPayload, routeHandlers = {}, options = {}) {
  const updateType = getUpdateType(maxPayload);

  if (!REPLY_UPDATE_TYPES.includes(updateType)) {
    return {
      mode: 'ignored',
      networkEnabled: false,
      updateType: updateType || 'unknown'
    };
  }

  if (updateType === 'bot_added') {
    const event = normalizeMaxEvent(maxPayload);
    const response = {
      kind: 'text',
      text: WELCOME_TEXT,
      recipient: event.recipient
    };
    const outboundClient = createMaxOutboundClient();

    return {
      mode: 'dry-run',
      networkEnabled: false,
      response,
      outbound: await outboundClient.send(response)
    };
  }

  const event = normalizeMaxEvent(maxPayload);
  const parsed = parseCommand(event.message.text);

  if (parsed) {
    const commandRegistry = options.commandRegistry || createCommandRegistry({
      identityHandler: options.identityHandler || null
    });
    const entry = commandRegistry.lookup(parsed.command);

    if (entry) {
      const response = entry.handler(event);
      const outboundClient = createMaxOutboundClient();

      return {
        mode: 'dry-run',
        networkEnabled: false,
        response,
        outbound: await outboundClient.send(response)
      };
    }
  }

  const response = {
    kind: 'text',
    text: UNKNOWN_COMMAND_TEXT,
    recipient: event.recipient
  };
  const outboundClient = createMaxOutboundClient();

  return {
    mode: 'dry-run',
    networkEnabled: false,
    response,
    outbound: await outboundClient.send(response)
  };
}

module.exports = {
  runMaxIdentityDryRun,
  REPLY_UPDATE_TYPES,
  WELCOME_TEXT,
  UNKNOWN_COMMAND_TEXT
};
