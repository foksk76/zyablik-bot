// SPDX-License-Identifier: Apache-2.0
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

  const updateType = getUpdateType(payload);
  const recipient = getRecipientFromPayload(payload, updateType);
  const message = getMessageFromPayload(payload);

  if (!recipient) {
    throw new Error('Unsupported MAX update type');
  }

  if (!recipient.value) {
    throw new Error('Missing MAX recipient value');
  }

  return createInternalEvent({
    source: SOURCE_MAX,
    recipient,
    message: {
      text: getMessageText(message)
    },
    raw: {
      kind: 'reference',
      value: normalizeId(message.id || payload.message_id || payload.timestamp) || '<raw-event-reference>'
    }
  });
}

function getUpdateType(payload) {
  return typeof payload.update_type === 'string' && payload.update_type
    ? payload.update_type
    : payload.event_type;
}

function getRecipientFromPayload(payload, updateType) {
  if (updateType === 'bot_started') {
    return getUserRecipient(payload.user || payload.sender || {});
  }

  if (updateType === 'bot_added') {
    return {
      kind: RECIPIENT_KIND_CHAT,
      value: normalizeId(payload.chat_id)
    };
  }

  if (updateType && updateType !== 'message_created') {
    return null;
  }

  // For message_created, the authoritative "user or chat" indicator is
  // message.recipient.chat_type: "dialog" means personal (use sender.user_id),
  // "chat"/"group"/"channel" means group chat (use recipient.chat_id).
  // The MAX API sends recipient.chat_id for BOTH personal and group messages,
  // so recipient.chat_id alone is not enough — we must check chat_type first.
  // message.sender must NOT take precedence for group messages — replying to
  // the sender of a group message would send a direct message to that user
  // instead of the chat.
  const message = getMessageFromPayload(payload);

  const recipientChatType = message && message.recipient && typeof message.recipient === 'object'
    ? message.recipient.chat_type
    : undefined;

  if (recipientChatType === 'dialog') {
    return getUserRecipient(message.sender || payload.sender || {});
  }

  const recipientFromMessage = getRecipientFromOfficialMessage(message);

  if (recipientFromMessage) {
    return recipientFromMessage;
  }

  if (payload.chat && typeof payload.chat === 'object' && !Array.isArray(payload.chat)) {
    return getRecipientFromChat(payload.chat, payload.sender || {});
  }

  const chatId = normalizeId(payload.chat_id || payload.chatId);
  if (chatId) {
    return {
      kind: RECIPIENT_KIND_CHAT,
      value: chatId
    };
  }

  // Only fall back to the sender when there is no recipient of any kind — i.e.
  // a personal dialog where the recipient object is absent.
  const senderRecipient = getUserRecipient(message.sender || payload.sender || {});

  if (senderRecipient.value) {
    return senderRecipient;
  }

  return getRecipientFromChat(payload.chat || {}, payload.sender || {});
}

function getMessageFromPayload(payload) {
  return payload && payload.message && typeof payload.message === 'object'
    ? payload.message
    : payload;
}

function getRecipientFromOfficialMessage(message) {
  const recipient = message && message.recipient && typeof message.recipient === 'object'
    ? message.recipient
    : null;

  if (!recipient) {
    return null;
  }

  const chatId = normalizeId(recipient.chat_id || recipient.chatId);
  if (chatId) {
    return {
      kind: RECIPIENT_KIND_CHAT,
      value: chatId
    };
  }

  const userId = normalizeId(recipient.user_id || recipient.userId);
  if (userId) {
    return {
      kind: RECIPIENT_KIND_USER,
      value: userId
    };
  }

  const recipientType = typeof recipient.type === 'string' ? recipient.type : '';
  const genericId = normalizeId(recipient.id);

  if (genericId && (recipientType === 'chat' || recipientType === 'group' || recipientType === 'channel')) {
    return {
      kind: RECIPIENT_KIND_CHAT,
      value: genericId
    };
  }

  if (genericId && (recipientType === 'user' || recipientType === 'dialog')) {
    return {
      kind: RECIPIENT_KIND_USER,
      value: genericId
    };
  }

  return null;
}

function getRecipientFromChat(chat, sender) {
  if (chat.type === 'dialog') {
    return getUserRecipient(sender);
  }

  if (chat.type === 'group') {
    return {
      kind: RECIPIENT_KIND_CHAT,
      value: normalizeId(chat.id)
    };
  }

  throw new Error('Unsupported MAX chat type');
}

function getUserRecipient(user) {
  return {
    kind: RECIPIENT_KIND_USER,
    value: normalizeId(user.id || user.user_id || user.userId)
  };
}

function getMessageText(message) {
  if (message && typeof message.text === 'string') {
    return message.text;
  }

  const body = message && message.body && typeof message.body === 'object'
    ? message.body
    : null;

  if (body && typeof body.text === 'string') {
    return body.text;
  }

  return '';
}

function normalizeId(value) {
  if (typeof value === 'string' && value) {
    return value;
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return undefined;
}

module.exports = {
  normalizeMaxEvent,
  getUpdateType
};
