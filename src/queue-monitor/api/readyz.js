// SPDX-License-Identifier: Apache-2.0
'use strict';

const MODULE_NAME = 'queue-monitor-readyz';

function createReadyzRoute(options = {}) {
  const reader = options.reader;

  if (!reader) {
    throw new Error('reader is required');
  }

  function readyz(_ctx) {
    const isReady = reader.ready();

    if (isReady) {
      return {
        statusCode: 200,
        body: { status: 'ok' }
      };
    }

    return {
      statusCode: 503,
      body: { status: 'error', error: 'Database not ready' }
    };
  }

  return {
    readyz
  };
}

module.exports = {
  MODULE_NAME,
  createReadyzRoute
};
