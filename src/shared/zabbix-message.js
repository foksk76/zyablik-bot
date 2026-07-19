// SPDX-License-Identifier: Apache-2.0
'use strict';

const SEVERITY_ICONS = {
  Warning: { icon: '⚠️', notify: false },
  Average: { icon: '☢️', notify: true },
  High: { icon: '⛔', notify: true },
  Disaster: { icon: '🔥', notify: true }
};

const DEFAULT_ICON = 'ℹ️';
const MAX_MESSAGE_LENGTH = 4000;

function buildAlertMessage(params) {
  let icon;
  let notify = true;

  if (params.Trigger_status === 'OK') {
    icon = '✅';
    notify = false;
  } else {
    const severity = SEVERITY_ICONS[params.Severity];
    if (severity) {
      icon = severity.icon;
      notify = severity.notify;
    } else {
      icon = DEFAULT_ICON;
      notify = false;
    }
  }

  const text = icon + ' ' + params.Subject + '\n' + params.Message;

  return {
    text: text.length > MAX_MESSAGE_LENGTH
      ? text.substring(0, MAX_MESSAGE_LENGTH - 10) + '\n...'
      : text,
    notify
  };
}

module.exports = { buildAlertMessage };
