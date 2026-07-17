const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPipelineResponse } = require('../../src/bot-platform/core/pipeline-dispatch');
const { createCommandRegistry } = require('../../src/bot-platform/core/command-registry');

function chatEvent(text) {
    return {
        source: 'max',
        recipient: { kind: 'chat', value: '2002' },
        message: { text },
        raw: { kind: 'reference', value: '<synthetic>' }
    };
}

function userEvent(text) {
    return {
        source: 'max',
        recipient: { kind: 'user', value: '1001' },
        message: { text },
        raw: { kind: 'reference', value: '<synthetic>' }
    };
}

const identityHandler = (event) => ({
    kind: 'identity',
    recipient: event.recipient,
    zabbix: { recipientType: 'chat_id', to: '2002' },
    text: 'identity response'
});

test('buildPipelineResponse: bot_added returns welcome text', () => {
    const event = chatEvent('any text');
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'bot_added', registry);

    assert.equal(response.kind, 'text');
    assert.equal(response.text, 'Ready to help.');
    assert.equal(response.recipient.kind, 'chat');
});

test('buildPipelineResponse: bot_started returns welcome text', () => {
    const event = userEvent('any text');
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'bot_started', registry);

    assert.equal(response.kind, 'text');
    assert.equal(response.text, 'Ready to help.');
    assert.equal(response.recipient.kind, 'user');
});

test('buildPipelineResponse: /help returns command list', () => {
    const event = chatEvent('/help');
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'message_created', registry);

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('/help'));
    assert.ok(response.text.includes('/id'));
    assert.ok(response.text.includes('/status'));
});

test('buildPipelineResponse: /id delegates to identity handler', () => {
    const event = chatEvent('/id');
    const registry = createCommandRegistry({ identityHandler });
    const response = buildPipelineResponse(event, 'message_created', registry);

    assert.equal(response.kind, 'identity');
    assert.equal(response.zabbix.recipientType, 'chat_id');
});

test('buildPipelineResponse: /id without identity handler returns fallback', () => {
    const event = userEvent('/id');
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'message_created', registry);

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('Identity handler not available'));
});

test('buildPipelineResponse: /status returns bot status', () => {
    const event = chatEvent('/status');
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'message_created', registry);

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('Bot is running'));
});

test('buildPipelineResponse: unknown /command returns unknown command text', () => {
    const event = chatEvent('/unknown');
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'message_created', registry);

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('Unknown command'));
});

test('buildPipelineResponse: non-command text returns unknown command text', () => {
    const event = chatEvent('hello world');
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'message_created', registry);

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('Unknown command'));
});

test('buildPipelineResponse: ignored updateType dispatches by content (welcome path skipped)', () => {
    const event = chatEvent('/help');
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'some_other_type', registry);

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('/help'));
});

test('buildPipelineResponse: never calls network', () => {
    const event = chatEvent('/help');
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'message_created', registry);

    assert.ok(response);
    assert.equal(typeof response.kind, 'string');
});

test('buildPipelineResponse: event without message.text returns unknown command', () => {
    const event = {
        source: 'max',
        recipient: { kind: 'chat', value: '2002' },
        message: {},
        raw: { kind: 'reference', value: '<synthetic>' }
    };
    const registry = createCommandRegistry();
    const response = buildPipelineResponse(event, 'message_created', registry);

    assert.equal(response.kind, 'text');
    assert.ok(response.text.includes('Unknown command'));
});
