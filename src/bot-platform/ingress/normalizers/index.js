// SPDX-License-Identifier: Apache-2.0
'use strict';

const { normalizeIngestEvent } = require('./ingest');

function getNormalizer() {
  return normalizeIngestEvent;
}

module.exports = {
  normalizeIngestEvent,
  getNormalizer
};
