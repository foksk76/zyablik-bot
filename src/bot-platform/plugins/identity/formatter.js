'use strict';

const { RECIPIENT_TYPE_MAP } = require('../../core/pipeline-constants');

function formatIdentityResponse(event) {
  const recipient = event && event.recipient ? event.recipient : {};
  const recipientType = RECIPIENT_TYPE_MAP[recipient.kind];

  if (!recipientType) {
    throw new Error('Unsupported identity recipient kind');
  }

  if (!recipient.value) {
    throw new Error('Missing identity recipient value');
  }

  return {
    kind: 'identity',
    recipient: {
      kind: recipient.kind
    },
    zabbix: {
      recipientType,
      to: recipient.value
    },
    text: formatText(recipientType, recipient.value)
  };
}

function formatText(recipientType, to) {
  return [
    'Recipient parameters:',
    `RecipientType: ${recipientType}`,
    `To: ${to}`
  ].join('\n');
}

module.exports = {
  formatIdentityResponse
};
