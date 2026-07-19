// SPDX-License-Identifier: Apache-2.0
'use strict';

function parseCommand(text) {
  if (typeof text !== 'string') {
    return null;
  }

  const trimmed = text.trim();

  if (!trimmed.startsWith('/')) {
    return null;
  }

  const withoutSlash = trimmed.slice(1);

  if (!withoutSlash) {
    return null;
  }

  const spaceIndex = withoutSlash.indexOf(' ');
  const command = spaceIndex === -1
    ? withoutSlash.toLowerCase()
    : withoutSlash.slice(0, spaceIndex).toLowerCase();
  const args = spaceIndex === -1 ? '' : withoutSlash.slice(spaceIndex + 1);

  if (!command) {
    return null;
  }

  return { command: `/${command}`, args };
}

module.exports = {
  parseCommand
};
