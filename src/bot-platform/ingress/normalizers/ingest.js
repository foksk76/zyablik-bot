// SPDX-License-Identifier: Apache-2.0
'use strict';

const { createInternalEvent, RECIPIENT_KIND_USER, RECIPIENT_KIND_CHAT } = require('../../core/event-contract');

const MODULE_NAME = 'ingest-normalizer';

function normalizeIngestEvent(body, source) {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid event body');
  }

  const recipient = body.recipient;

  if (!recipient || typeof recipient !== 'object') {
    throw new Error('Missing recipient');
  }

  const kind = recipient.kind;
  const value = recipient.value;

  if (!kind) {
    throw new Error('Missing recipient.kind');
  }

  if (kind !== RECIPIENT_KIND_USER && kind !== RECIPIENT_KIND_CHAT) {
    throw new Error(`Unsupported recipient kind: ${kind}`);
  }

  if (!value) {
    throw new Error('Missing recipient.value');
  }

  const message = body.message || '';
  const format = typeof body.format === 'string' ? body.format.trim().toLowerCase() : '';

  return createInternalEvent({
    source: source || 'ingest',
    recipient: { kind, value },
    message: {
      text: typeof message === 'string' ? message : JSON.stringify(message),
      format: ['markdown', 'html'].indexOf(format) !== -1 ? format : ''
    },
    raw: {
      kind: 'reference',
      value: `<event-${Date.now()}>`
    }
  });
}

module.exports = {
  MODULE_NAME,
  normalizeIngestEvent
};
