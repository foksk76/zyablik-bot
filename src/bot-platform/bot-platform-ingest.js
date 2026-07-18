#!/usr/bin/env node
'use strict';

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const { buildAlertMessage } = require('../shared/zabbix-message');

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
      const raw = arg.slice(2);
      const eqIndex = raw.indexOf('=');
      if (eqIndex === -1) {
        args[raw] = true;
      } else {
        args[raw.slice(0, eqIndex)] = raw.slice(eqIndex + 1);
      }
    }
  }
  return args;
}

function resolveConfig(options = {}) {
  return {
    idpIssuer: options.idpIssuer || process.env.IDP_ISSUER || 'http://localhost:8000',
    idpClientId: options.idpClientId || process.env.IDP_CLIENT_ID || 'zabbix-bot',
    idpClientSecret: options.idpClientSecret || process.env.IDP_CLIENT_SECRET,
    idpAudience: options.idpAudience || process.env.IDP_AUDIENCE || 'bot-platform',
    ingestUrl: options.ingestUrl || process.env.INGRESS_URL || 'http://localhost:8443/ingest'
  };
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

async function sendToIngress(ingestUrl, token, recipient, message) {
  const payload = {
    recipient,
    message
  };

  log('info', `Step 2: Sending to ${ingestUrl}`);
  log('info', `Step 2: Payload: ${JSON.stringify({ recipient, messageLength: message.length })}`);

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
    const config = resolveConfig(options);
    const recipient = options.recipient || { kind: 'user', value: options.userId || '123' };
    const message = options.message || 'Test message from bot-platform-ingest.js';

    if (!config.idpClientSecret) {
      throw new Error('IDP_CLIENT_SECRET is required (set via options or env)');
    }

    log('info', `=== Live Run Test Started ===`);
    log('info', `Config: IDP=${config.idpIssuer}, INGEST=${config.ingestUrl}`);
    log('info', `Recipient: ${JSON.stringify(recipient)}`);

    // Step 1: Get token
    const token = await getToken(config.idpIssuer, config.idpClientId, config.idpClientSecret, config.idpAudience);
    results.steps.push({ step: 1, name: 'getToken', status: 'ok', duration: Date.now() - startTime });

    // Step 2: Send to ingress
    const step2Start = Date.now();
    const ingestResponse = await sendToIngress(config.ingestUrl, token, recipient, message);
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

    if (!params.Token) {
      throw new Error('Parameter "Token" is required');
    }
    if (!params.To) {
      throw new Error('Parameter "To" is required');
    }

    const alert = buildAlertMessage(params);
    log('info', `Step 1: Message built (length: ${alert.text.length}, notify: ${alert.notify})`);

    const recipientType = (params.RecipientType || 'chat_id').toLowerCase();
    const recipient = {
      kind: recipientType === 'user_id' ? 'user' : 'chat',
      value: params.To
    };
    log('info', `Step 2: Recipient parsed: ${JSON.stringify(recipient)}`);

    const config = resolveConfig({
      idpIssuer: params.APIUrl,
      idpClientId: params.ClientId,
      idpClientSecret: params.Token,
      idpAudience: params.Audience,
      ingestUrl: params.IngestUrl
    });

    const token = await getToken(config.idpIssuer, config.idpClientId, config.idpClientSecret, config.idpAudience);

    const result = await sendToIngress(config.ingestUrl, token, recipient, alert.text);
    log('info', `Step 3: Ingest response: ${JSON.stringify(result)}`);

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
    const recipientKind = args.kind || 'user';
    const results = await runLiveTest({
      idpClientSecret: args.secret,
      recipient: { kind: recipientKind, value: args['user-id'] || '123' },
      message: args.message || 'Test message from bot-platform-ingest.js'
    });

    console.log(JSON.stringify(results, null, 2));
    process.exit(results.success ? 0 : 1);

  } else if (args['zabbix']) {
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
    const params = {
      Token: '<from --secret or IDP_CLIENT_SECRET>',
      To: args['user-id'] || '123',
      Subject: args['subject'] || 'Test Alert',
      Message: args['message'] || 'Test message',
      Severity: args['severity'] || 'High',
      Trigger_status: args['status'] || 'PROBLEM',
      RecipientType: args['recipient-type'] || 'user_id'
    };

    const alert = buildAlertMessage(params);
    const recipientType = (params.RecipientType || 'chat_id').toLowerCase();

    console.log('=== Dry Run ===');
    console.log(`Recipient: { kind: "${recipientType === 'user_id' ? 'user' : 'chat'}", value: "${params.To}" }`);
    console.log(`Message: ${alert.text.substring(0, 100)}...`);
    console.log(`Would send to: ${process.env.INGRESS_URL || 'http://localhost:8443/ingest'}`);
    console.log(`Would authenticate via: ${process.env.IDP_ISSUER || 'http://localhost:8000'}`);

  } else {
    console.log('Usage:');
    console.log('  node bot-platform-ingest.js --test --secret=<IDP_CLIENT_SECRET> [--user-id=123] [--message="test"]');
    console.log('  node bot-platform-ingest.js --dry-run [--user-id=123] [--message="test"]');
    console.log('  echo \'{"Token":"...","To":"123",...}\' | node bot-platform-ingest.js --zabbix');
    console.log('');
    console.log('Options:');
    console.log('  --test              Run live test against ingress');
    console.log('  --secret=<secret>   IdP client secret (required for --test)');
    console.log('  --dry-run           Show what would be sent');
    console.log('  --zabbix            Zabbix webhook mode (read params from stdin)');
    console.log('  --user-id=<id>      Recipient user ID');
    console.log('  --message=<text>    Message text');
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
  buildAlertMessage,
  getToken,
  sendToIngress,
  runLiveTest,
  runZabbixWebhook
};
