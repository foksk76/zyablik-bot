'use strict';

function createCommandRegistry(options = {}) {
  const identityHandler = options.identityHandler || null;

  const commands = {
    '/help': {
      description: 'Show available commands',
      handler: handleHelp
    },
    '/id': {
      description: 'Show recipient parameters for this chat',
      handler: handleId
    },
    '/status': {
      description: 'Check bot status',
      handler: handleStatus
    }
  };

  function lookup(commandName) {
    const cmd = commands[commandName];

    if (!cmd) {
      return null;
    }

    return cmd;
  }

  function getCommandList() {
    return Object.keys(commands).map(function (name) {
      return { name, description: commands[name].description };
    });
  }

  function handleHelp(event) {
    const list = getCommandList();
    const lines = list.map(function (cmd) {
      return `${cmd.name} — ${cmd.description}`;
    });

    return {
      kind: 'text',
      text: lines.join('\n'),
      recipient: event ? event.recipient : undefined
    };
  }

  function handleId(event) {
    if (!identityHandler) {
      return {
        kind: 'text',
        text: 'Identity handler not available',
        recipient: event ? event.recipient : undefined
      };
    }

    return identityHandler(event);
  }

  function handleStatus(event) {
    return {
      kind: 'text',
      text: 'Bot is running',
      recipient: event ? event.recipient : undefined
    };
  }

  return {
    lookup,
    getCommandList
  };
}

module.exports = {
  createCommandRegistry
};
