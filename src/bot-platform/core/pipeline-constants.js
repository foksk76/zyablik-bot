'use strict';

const REPLY_UPDATE_TYPES = Object.freeze(['message_created', 'bot_added', 'bot_started']);
const WELCOME_TEXT = 'Ready to help.';
const UNKNOWN_COMMAND_TEXT = 'Unknown command. Send /help for available commands.';
const RECIPIENT_TYPE_MAP = Object.freeze({
  user: 'user_id',
  chat: 'chat_id'
});

module.exports = {
  REPLY_UPDATE_TYPES,
  WELCOME_TEXT,
  UNKNOWN_COMMAND_TEXT,
  RECIPIENT_TYPE_MAP
};
