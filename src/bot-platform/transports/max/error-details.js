// SPDX-License-Identifier: Apache-2.0
'use strict';

function buildSafeTransportErrorDetails(error, defaults = {}) {
  const details = {
    ...defaults
  };
  const source = error && typeof error === 'object' ? error : null;
  const cause = source && source.cause && typeof source.cause === 'object'
    ? source.cause
    : null;

  const causeCode = readFirstString(source, cause, 'code');
  const causeMessage = readFirstString(cause, source, 'message');
  const causeHost = readFirstString(cause, source, 'hostname');

  if (causeCode) {
    details.causeCode = causeCode;
  }

  if (causeMessage) {
    details.causeMessage = causeMessage;
  }

  if (causeHost) {
    details.causeHost = causeHost;
  }

  return details;
}

function readFirstString(primary, fallback, key) {
  if (primary && typeof primary[key] === 'string' && primary[key].trim()) {
    return primary[key].trim();
  }

  if (fallback && typeof fallback[key] === 'string' && fallback[key].trim()) {
    return fallback[key].trim();
  }

  return null;
}

module.exports = {
  buildSafeTransportErrorDetails
};
