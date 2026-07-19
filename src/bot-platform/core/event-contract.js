// SPDX-License-Identifier: Apache-2.0
'use strict';

const SOURCE_MAX = 'max';
const SOURCE_ZABBIX = 'zabbix';
const SOURCE_INGEST = 'ingest';
const RECIPIENT_KIND_USER = 'user';
const RECIPIENT_KIND_CHAT = 'chat';
const RECIPIENT_KINDS = Object.freeze([
  RECIPIENT_KIND_USER,
  RECIPIENT_KIND_CHAT
]);

function isSupportedRecipientKind(kind) {
  return RECIPIENT_KINDS.includes(kind);
}

function createInternalEvent(input = {}) {
  const recipient = input.recipient || {};
  const message = input.message || {};
  const raw = input.raw || {};

  if (!isSupportedRecipientKind(recipient.kind)) {
    throw new Error('Unsupported recipient kind');
  }

  return {
    source: input.source || SOURCE_MAX,
    recipient: {
      kind: recipient.kind,
      value: recipient.value || '<recipient-value>'
    },
    message: {
      text: message.text || ''
    },
    raw: {
      kind: raw.kind || 'reference',
      value: raw.value || '<raw-event-reference>'
    }
  };
}

module.exports = {
  SOURCE_MAX,
  SOURCE_ZABBIX,
  SOURCE_INGEST,
  RECIPIENT_KIND_USER,
  RECIPIENT_KIND_CHAT,
  RECIPIENT_KINDS,
  isSupportedRecipientKind,
  createInternalEvent
};
