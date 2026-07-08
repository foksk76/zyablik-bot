'use strict';

const {
  SOURCE_MAX,
  RECIPIENT_KIND_USER,
  RECIPIENT_KIND_CHAT,
  createInternalEvent
} = require('../../core/event-contract');

function normalizeMaxEvent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid MAX inbound event');
  }

  const chat = payload.chat || {};
  const sender = payload.sender || {};
  const message = payload.message || {};

  const recipient = getRecipientFromChat(chat, sender);

  if (!recipient.value) {
    throw new Error('Missing MAX recipient value');
  }

  return createInternalEvent({
    source: SOURCE_MAX,
    recipient,
    message: {
      text: typeof message.text === 'string' ? message.text : ''
    },
    raw: {
      kind: 'reference',
      value: typeof message.id === 'string' ? message.id : '<raw-event-reference>'
    }
  });
}

function getRecipientFromChat(chat, sender) {
  if (chat.type === 'dialog') {
    return {
      kind: RECIPIENT_KIND_USER,
      value: sender.id || chat.id
    };
  }

  if (chat.type === 'group') {
    return {
      kind: RECIPIENT_KIND_CHAT,
      value: chat.id
    };
  }

  throw new Error('Unsupported MAX chat type');
}

module.exports = {
  normalizeMaxEvent
};
