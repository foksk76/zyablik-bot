// SPDX-License-Identifier: Apache-2.0
'use strict';

var buildAlertMessage = require('../shared/zabbix-message').buildAlertMessage;

var MODULE_NAME = 'bot-platform-ingest';

function log(level, message) {
    if (typeof Zabbix !== 'undefined' && typeof Zabbix.log === 'function') {
        var prefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
        Zabbix.log(4, '[' + MODULE_NAME + '] [' + prefix + '] ' + message);
    } else if (typeof console !== 'undefined' && console.error) {
        var timestamp = new Date().toISOString();
        var conPrefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
        console.error('[' + timestamp + '] [' + MODULE_NAME + '] [' + conPrefix + '] ' + message);
    }
}

function httpRequest(url, options, body) {
    return new Promise(function (resolve, reject) {
        if (typeof HttpRequest !== 'undefined') {
            var request = new HttpRequest();

            if (options.proxy) {
                request.setProxy(options.proxy);
            }

            var headerKeys = Object.keys(options.headers || {});
            for (var i = 0; i < headerKeys.length; i++) {
                request.addHeader(headerKeys[i] + ': ' + options.headers[headerKeys[i]]);
            }

            var response;
            var method = (options.method || 'POST').toUpperCase();

            if (method === 'POST') {
                response = request.post(url, body || '');
            } else if (method === 'GET') {
                response = request.get(url);
            } else {
                response = request.post(url, body || '');
            }

            var statusCode = request.getStatus();
            resolve({
                status: statusCode,
                body: response || ''
            });
        } else {
            var http = require('node:http');
            var https = require('node:https');
            var parsedUrl = new URL(url);
            var client = parsedUrl.protocol === 'https:' ? https : http;

            var req = client.request(url, {
                method: options.method || 'POST',
                headers: options.headers || {},
                timeout: options.timeout || 30000
            }, function (res) {
                var data = '';
                res.on('data', function (chunk) { data += chunk; });
                res.on('end', function () {
                    resolve({
                        status: res.statusCode,
                        body: data
                    });
                });
            });

            req.on('error', reject);
            req.on('timeout', function () {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (body) {
                req.write(body);
            }
            req.end();
        }
    });
}

function parseArgs(argv) {
    var args = {};
    for (var i = 2; i < argv.length; i++) {
        var arg = argv[i];
        if (arg.indexOf('--') === 0) {
            var raw = arg.slice(2);
            var eqIndex = raw.indexOf('=');
            if (eqIndex === -1) {
                args[raw] = true;
            } else {
                args[raw.slice(0, eqIndex)] = raw.slice(eqIndex + 1);
            }
        }
    }
    return args;
}

function resolveConfig(options) {
    options = options || {};
    var env = typeof process !== 'undefined' ? (process.env || {}) : {};
    return {
        idpIssuer: options.idpIssuer || env.IDP_ISSUER || 'http://localhost:8000',
        idpClientId: options.idpClientId || env.IDP_CLIENT_ID || 'zabbix-bot',
        idpClientSecret: options.idpClientSecret || env.IDP_CLIENT_SECRET,
        idpAudience: options.idpAudience || env.IDP_AUDIENCE || 'bot-platform',
        ingestUrl: options.ingestUrl || env.INGRESS_URL || 'http://localhost:8443/ingest'
    };
}

async function getToken(idpIssuer, idpClientId, idpClientSecret, idpAudience) {
    var tokenUrl = idpIssuer + '/token';
    var body = 'grant_type=client_credentials&audience=' + encodeURIComponent(idpAudience);

    log('info', 'Step 1: Getting token from ' + tokenUrl);

    var authHeader = 'Basic ' + Buffer.from(idpClientId + ':' + idpClientSecret).toString('base64');

    var response = await httpRequest(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authHeader
        }
    }, body);

    if (response.status !== 200) {
        throw 'Token request failed: ' + response.status + ' ' + response.body;
    }

    var tokenResponse = JSON.parse(response.body);
    log('info', 'Step 1: Token received (expires in ' + tokenResponse.expires_in + 's)');
    return tokenResponse.access_token;
}

async function sendToIngress(ingestUrl, token, recipient, message) {
    var payload = {
        recipient: recipient,
        message: message
    };

    log('info', 'Step 2: Sending to ' + ingestUrl);
    log('info', 'Step 2: Payload: ' + JSON.stringify({ recipient: recipient, messageLength: message.length }));

    var response = await httpRequest(ingestUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        }
    }, JSON.stringify(payload));

    log('info', 'Step 2: Response status: ' + response.status);
    log('info', 'Step 2: Response body: ' + response.body);

    if (response.status !== 200) {
        throw 'Ingest request failed: ' + response.status + ' ' + response.body;
    }

    return JSON.parse(response.body);
}

async function runZabbixWebhook(params) {
    var startTime = Date.now();

    log('info', '=== Zabbix Webhook Started ===');

    if (!params.Token) {
        throw 'Incorrect value is given for parameter "Token": parameter is missing';
    }

    if (!params.To) {
        throw 'Incorrect value is given for parameter "To": parameter is missing';
    }

    var alert = buildAlertMessage(params);
    log('info', 'Step 1: Message built (length: ' + alert.text.length + ', notify: ' + alert.notify + ')');

    var recipientType = (params.RecipientType || 'chat_id').toLowerCase();
    var recipient = {
        kind: recipientType === 'user_id' ? 'user' : 'chat',
        value: params.To
    };
    log('info', 'Step 2: Recipient parsed: ' + JSON.stringify(recipient));

    var config = resolveConfig({
        idpIssuer: params.APIUrl,
        idpClientId: params.ClientId,
        idpClientSecret: params.Token,
        idpAudience: params.Audience,
        ingestUrl: params.IngestUrl
    });

    var token = await getToken(config.idpIssuer, config.idpClientId, config.idpClientSecret, config.idpAudience);

    var result = await sendToIngress(config.ingestUrl, token, recipient, alert.text);
    log('info', 'Step 3: Ingest response: ' + JSON.stringify(result));

    log('info', '=== Zabbix Webhook Completed Successfully ===');
    log('info', 'Total duration: ' + (Date.now() - startTime) + 'ms');

    return 'OK';
}

async function runLiveTest(options) {
    options = options || {};
    var startTime = Date.now();
    var results = { steps: [], success: false };

    try {
        var config = resolveConfig(options);
        var recipient = options.recipient || { kind: 'user', value: options.userId || '123' };
        var message = options.message || 'Test message from bot-platform-ingest.js';

        if (!config.idpClientSecret) {
            throw 'IDP_CLIENT_SECRET is required (set via options or env)';
        }

        log('info', '=== Live Run Test Started ===');
        log('info', 'Config: IDP=' + config.idpIssuer + ', INGEST=' + config.ingestUrl);
        log('info', 'Recipient: ' + JSON.stringify(recipient));

        var token = await getToken(config.idpIssuer, config.idpClientId, config.idpClientSecret, config.idpAudience);
        results.steps.push({ step: 1, name: 'getToken', status: 'ok', duration: Date.now() - startTime });

        var step2Start = Date.now();
        var ingestResponse = await sendToIngress(config.ingestUrl, token, recipient, message);
        results.steps.push({ step: 2, name: 'sendToIngress', status: 'ok', duration: Date.now() - step2Start, response: ingestResponse });

        results.success = true;
        log('info', '=== Live Run Test Completed Successfully ===');
        log('info', 'Total duration: ' + (Date.now() - startTime) + 'ms');

    } catch (error) {
        results.error = typeof error === 'string' ? error : error.message || String(error);
        log('error', '=== Live Run Test Failed: ' + results.error + ' ===');
    }

    return results;
}

function isZabbixEnvironment() {
    return typeof value !== 'undefined' && typeof Zabbix !== 'undefined';
}

if (isZabbixEnvironment()) {
    (async function () {
        try {
            var params = JSON.parse(value);
            var result = await runZabbixWebhook(params);
            return result;
        } catch (error) {
            Zabbix.log(4, '[' + MODULE_NAME + '] notification failed: ' + error);
            throw 'Sending failed: ' + error + '.';
        }
    })();
} else if (typeof process !== 'undefined' && process.argv && require.main === module) {
    var args = parseArgs(process.argv);

    if (args.test) {
        var userId = args['user-id'] || '123';
        var recipientKind = args.kind;
        if (!recipientKind || recipientKind === 'auto') {
            recipientKind = userId.indexOf('-') === 0 ? 'chat' : 'user';
        }
        runLiveTest({
            idpClientSecret: args.secret,
            recipient: { kind: recipientKind, value: userId },
            message: args.message || 'Test message from bot-platform-ingest.js'
        }).then(function (results) {
            console.log(JSON.stringify(results, null, 2));
            process.exit(results.success ? 0 : 1);
        }).catch(function (error) {
            log('error', error.message || error);
            process.exit(1);
        });

    } else if (args['dry-run']) {
        var dryParams = {
            Token: '<from --secret or IDP_CLIENT_SECRET>',
            To: args['user-id'] || '123',
            Subject: args['subject'] || 'Test Alert',
            Message: args['message'] || 'Test message',
            Severity: args['severity'] || 'High',
            Trigger_status: args['status'] || 'PROBLEM',
            RecipientType: args['recipient-type'] || 'user_id'
        };

        var alert = buildAlertMessage(dryParams);
        var dryRecipientType = (dryParams.RecipientType || 'chat_id').toLowerCase();

        console.log('=== Dry Run ===');
        console.log('Recipient: { kind: "' + (dryRecipientType === 'user_id' ? 'user' : 'chat') + '", value: "' + dryParams.To + '" }');
        console.log('Message: ' + alert.text.substring(0, 100) + '...');
        console.log('Would send to: ' + (typeof process !== 'undefined' ? (process.env || {}).INGRESS_URL || 'http://localhost:8443/ingest' : 'http://localhost:8443/ingest'));
        console.log('Would authenticate via: ' + (typeof process !== 'undefined' ? (process.env || {}).IDP_ISSUER || 'http://localhost:8000' : 'http://localhost:8000'));

    } else {
        console.log('Usage:');
        console.log('  node bot-platform-ingest.js --test --secret=<IDP_CLIENT_SECRET> [--user-id=123] [--message="test"]');
        console.log('  node bot-platform-ingest.js --dry-run [--user-id=123] [--message="test"]');
        console.log('');
        console.log('Options:');
        console.log('  --test              Run live test against ingress');
        console.log('  --secret=<secret>   IdP client secret (required for --test)');
        console.log('  --dry-run           Show what would be sent');
        console.log('  --user-id=<id>      Recipient user ID');
        console.log('  --message=<text>    Message text');
        process.exit(1);
    }
}
