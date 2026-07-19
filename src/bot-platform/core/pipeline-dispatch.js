// SPDX-License-Identifier: Apache-2.0
'use strict';

const { parseCommand } = require('./command-parser');
const { WELCOME_TEXT, UNKNOWN_COMMAND_TEXT } = require('./pipeline-constants');

function buildPipelineResponse(event, updateType, commandRegistry) {
    if (updateType === 'bot_added' || updateType === 'bot_started') {
        return {
            kind: 'text',
            text: WELCOME_TEXT,
            recipient: event.recipient
        };
    }

    const text = event.message && event.message.text;
    const parsed = parseCommand(text);

    if (parsed) {
        const entry = commandRegistry.lookup(parsed.command);

        if (entry) {
            return entry.handler(event);
        }
    }

    return {
        kind: 'text',
        text: UNKNOWN_COMMAND_TEXT,
        recipient: event.recipient
    };
}

module.exports = {
    buildPipelineResponse
};
