'use strict';

const { createInternalEvent, SOURCE_ZABBIX, RECIPIENT_KIND_USER, RECIPIENT_KIND_CHAT } = require('../../core/event-contract');

const MODULE_NAME = 'zabbix-normalizer';

function normalizeZabbixEvent(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid Zabbix event body');
  }

  const recipient = body.recipient;

  if (!recipient || typeof recipient !== 'object') {
    throw new Error('Missing recipient in Zabbix event');
  }

  const kind = recipient.kind;
  const value = recipient.value;

  if (!kind) {
    throw new Error('Missing recipient.kind in Zabbix event');
  }

  if (kind !== RECIPIENT_KIND_USER && kind !== RECIPIENT_KIND_CHAT) {
    throw new Error(`Unsupported recipient kind: ${kind}`);
  }

  if (!value) {
    throw new Error('Missing recipient.value in Zabbix event');
  }

  const message = body.message || '';

  return createInternalEvent({
    source: SOURCE_ZABBIX,
    recipient: { kind, value },
    message: { text: typeof message === 'string' ? message : JSON.stringify(message) },
    raw: {
      kind: 'reference',
      value: `<zabbix-event-${Date.now()}>`
    }
  });
}

module.exports = {
  MODULE_NAME,
  normalizeZabbixEvent
};
