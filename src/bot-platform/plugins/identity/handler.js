// SPDX-License-Identifier: Apache-2.0
'use strict';

const { formatIdentityResponse } = require('./formatter');

function handleIdentityEvent(event) {
  if (!event || !event.recipient || !event.recipient.kind) {
    throw new Error('Invalid identity event');
  }

  return formatIdentityResponse(event);
}

module.exports = {
  handleIdentityEvent
};
