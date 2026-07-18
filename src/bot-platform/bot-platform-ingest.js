#!/usr/bin/env node
'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const MODULE_NAME = 'bot-platform-ingest';

function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
  console.error(`[${timestamp}] [${MODULE_NAME}] [${prefix}] ${message}`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value || true;
    }
  }
  return args;
}

function buildMessage(params) {
  let icon;
  let notify = true;

  if (params.Severity === 'Warning') {
    icon = '⚠️';
    notify = false;
  } else if (params.Severity === 'Average') {
    icon = String.fromCodePoint('0x2622');
  } else if (params.Severity === 'High') {
    icon = '⛔';
  } else if (params.Severity === 'Disaster') {
    icon = String.fromCodePoint('0x1F525');
  } else {
    icon = String.fromCodePoint('0x2139');
    notify = false;
  }

  if (params.Trigger_status === 'OK') {
    icon = '✅';
    notify = false;
  }

  const message = icon + ' ' + params.Subject + '\n' + params.Message;

  if (message.length > 4000) {
    return { text: message.substring(0, 3990) + '\n...', notify };
  }

  return { text: message, notify };
}

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request(url, {
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: options.timeout || 10000
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function getToken(idpIssuer, idpClientId, idpClientSecret, idpAudience) {
  const tokenUrl = `${idpIssuer}/token`;
  const body = `grant_type=client_credentials&audience=${encodeURIComponent(idpAudience)}`;

  log('info', `Step 1: Getting token from ${tokenUrl}`);

  const authHeader = 'Basic ' + Buffer.from(`${idpClientId}:${idpClientSecret}`).toString('base64');

  const response = await httpRequest(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': authHeader
    }
  }, body);

  if (response.status !== 200) {
    throw new Error(`Token request failed: ${response.status} ${response.body}`);
  }

  const tokenResponse = JSON.parse(response.body);
  log('info', `Step 1: Token received (expires in ${tokenResponse.expires_in}s)`);
  return tokenResponse.access_token;
}

async function sendToIngress(ingestUrl, token, recipient, message, source) {
  const payload = {
    recipient,
    message
  };

  log('info', `Step 2: Sending to ${ingestUrl}`);
  log('info', `Step 2: Payload: ${JSON.stringify({ recipient, messageLength: message.length, source })}`);

  const response = await httpRequest(ingestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, JSON.stringify(payload));

  log('info', `Step 2: Response status: ${response.status}`);
  log('info', `Step 2: Response body: ${response.body}`);

  if (response.status !== 200) {
    throw new Error(`Ingest request failed: ${response.status} ${response.body}`);
  }

  return JSON.parse(response.body);
}

async function runLiveTest(options = {}) {
  const startTime = Date.now();
  const results = { steps: [], success: false };

  try {
    const idpIssuer = options.idpIssuer || process.env.IDP_ISSUER || 'http://localhost:8000';
    const idpClientId = options.idpClientId || process.env.IDP_CLIENT_ID || 'zabbix-bot';
    const idpClientSecret = options.idpClientSecret || process.env.IDP_CLIENT_SECRET || 'zabbix-bot-secret-2024';
    const idpAudience = options.idpAudience || process.env.IDP_AUDIENCE || 'bot-platform';
    const ingestUrl = options.ingestUrl || process.env.INGRESS_URL || 'http://localhost:8443/ingest';
    const recipient = options.recipient || { kind: 'user', value: options.userId || '123' };
    const message = options.message || 'Test message from bot-platform-ingest.js';
    const source = options.source || 'zabbix';

    log('info', `=== Live Run Test Started ===`);
    log('info', `Config: IDP=${idpIssuer}, INGEST=${ingestUrl}`);
    log('info', `Recipient: ${JSON.stringify(recipient)}`);

    // Step 1: Get token
    const token = await getToken(idpIssuer, idpClientId, idpClientSecret, idpAudience);
    results.steps.push({ step: 1, name: 'getToken', status: 'ok', duration: Date.now() - startTime });

    // Step 2: Send to ingress
    const step2Start = Date.now();
    const ingestResponse = await sendToIngress(ingestUrl, token, recipient, message, source);
    results.steps.push({ step: 2, name: 'sendToIngress', status: 'ok', duration: Date.now() - step2Start, response: ingestResponse });

    results.success = true;
    log('info', `=== Live Run Test Completed Successfully ===`);
    log('info', `Total duration: ${Date.now() - startTime}ms`);

  } catch (error) {
    results.error = error.message;
    log('error', `=== Live Run Test Failed: ${error.message} ===`);
  }

  return results;
}

async function runZabbixWebhook(params) {
  const startTime = Date.now();

  try {
    log('info', '=== Zabbix Webhook Started ===');

    // Validate required params
    if (!params.Token) {
      throw new Error('Parameter "Token" is required');
    }
    if (!params.To) {
      throw new Error('Parameter "To" is required');
    }

    // Build message
    const { text: messageText, notify } = buildMessage(params);
    log('info', `Step 1: Message built (length: ${messageText.length}, notify: ${notify})`);

    // Parse recipient
    const recipientType = (params.RecipientType || 'chat_id').toLowerCase();
    const recipient = {
      kind: recipientType === 'user_id' ? 'user' : 'chat',
      value: params.To
    };
    log('info', `Step 2: Recipient parsed: ${JSON.stringify(recipient)}`);

    // Get token from IdP
    const idpIssuer = params.APIUrl || process.env.IDP_ISSUER || 'http://localhost:8000';
    const idpClientId = params.ClientId || process.env.IDP_CLIENT_ID || 'zabbix-bot';
    const idpClientSecret = params.Token;
    const idpAudience = params.Audience || process.env.IDP_AUDIENCE || 'bot-platform';

    const token = await getToken(idpIssuer, idpClientId, idpClientSecret, idpAudience);

    // Send to ingress
    const ingestUrl = params.IngestUrl || process.env.INGRESS_URL || 'http://localhost:8443/ingest';
    const result = await sendToIngress(ingestUrl, token, recipient, messageText, 'zabbix');

    log('info', `=== Zabbix Webhook Completed Successfully ===`);
    log('info', `Total duration: ${Date.now() - startTime}ms`);

    return 'OK';

  } catch (error) {
    log('error', `Zabbix Webhook failed: ${error.message}`);
    throw `Sending failed: ${error.message}.`;
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.test) {
    // Live test mode
    const results = await runLiveTest({
      userId: args['user-id'] || '123',
      message: args.message || 'Test message from bot-platform-ingest.js',
      source: args.source || 'zabbix'
    });

    console.log(JSON.stringify(results, null, 2));
    process.exit(results.success ? 0 : 1);

  } else if (args['zabbix']) {
    // Zabbix webhook mode - read params from stdin
    let input = '';
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('end', async () => {
      try {
        const params = JSON.parse(input);
        const result = await runZabbixWebhook(params);
        console.log(result);
        process.exit(0);
      } catch (error) {
        console.error(error);
        process.exit(1);
      }
    });

  } else if (args['dry-run']) {
    // Dry-run mode - show what would be sent
    const params = {
      Token: args['token'] || '<IDP_CLIENT_SECRET>',
      To: args['user-id'] || '123',
      Subject: args['subject'] || 'Test Alert',
      Message: args['message'] || 'Test message',
      Severity: args['severity'] || 'High',
      Trigger_status: args['status'] || 'PROBLEM',
      RecipientType: args['recipient-type'] || 'user_id'
    };

    const { text: messageText } = buildMessage(params);
    const recipientType = (params.RecipientType || 'chat_id').toLowerCase();

    console.log('=== Dry Run ===');
    console.log(`Recipient: { kind: "${recipientType === 'user_id' ? 'user' : 'chat'}", value: "${params.To}" }`);
    console.log(`Message: ${messageText.substring(0, 100)}...`);
    console.log(`Would send to: ${process.env.INGRESS_URL || 'http://localhost:8443/ingest'}`);
    console.log(`Would authenticate via: ${process.env.IDP_ISSUER || 'http://localhost:8000'}`);

  } else {
    console.log('Usage:');
    console.log('  node bot-platform-ingest.js --test [--user-id=123] [--message="test"]');
    console.log('  node bot-platform-ingest.js --dry-run [--user-id=123] [--message="test"]');
    console.log('  echo \'{"Token":"...","To":"123",...}\' | node bot-platform-ingest.js --zabbix');
    console.log('');
    console.log('Options:');
    console.log('  --test              Run live test against ingress');
    console.log('  --dry-run           Show what would be sent');
    console.log('  --zabbix            Zabbix webhook mode (read params from stdin)');
    console.log('  --user-id=<id>      Recipient user ID');
    console.log('  --message=<text>    Message text');
    console.log('  --source=<source>   Source identifier (default: zabbix)');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    log('error', error.message);
    process.exit(1);
  });
}

module.exports = {
  buildMessage,
  getToken,
  sendToIngress,
  runLiveTest,
  runZabbixWebhook
};
