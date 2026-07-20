// SPDX-License-Identifier: Apache-2.0
'use strict';

var MODULE_NAME = 'bot-platform-ingest';

function buildAlertMessage(params) {
    var SEVERITY_ICONS = {
        Warning: { icon: '⚠️', notify: false },
        Average: { icon: '☢️', notify: true },
        High: { icon: '⛔', notify: true },
        Disaster: { icon: '🔥', notify: true }
    };
    var DEFAULT_ICON = 'ℹ️';
    var MAX_MESSAGE_LENGTH = 4000;
    var icon;
    var notify = true;

    if (params.Trigger_status === 'OK') {
        icon = '✅';
        notify = false;
    } else {
        var severity = SEVERITY_ICONS[params.Severity];
        if (severity) {
            icon = severity.icon;
            notify = severity.notify;
        } else {
            icon = DEFAULT_ICON;
            notify = false;
        }
    }

    var text = icon + ' ' + params.Subject + '\n' + params.Message;

    return {
        text: text.length > MAX_MESSAGE_LENGTH
            ? text.substring(0, MAX_MESSAGE_LENGTH - 10) + '\n...'
            : text,
        notify: notify
    };
}

function log(level, message) {
    if (typeof Zabbix === 'undefined' || typeof Zabbix.log !== 'function') {
        return;
    }
    var prefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
    Zabbix.log(4, '[' + MODULE_NAME + '] [' + prefix + '] ' + message);
}

function base64Encode(str) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var result = '';
    var i = 0;
    var c1, c2, c3, e1, e2, e3, e4;

    while (i < str.length) {
        c1 = str.charCodeAt(i++) & 0xff;
        c2 = i < str.length ? str.charCodeAt(i++) & 0xff : void 0;
        c3 = i < str.length ? str.charCodeAt(i++) & 0xff : void 0;

        e1 = c1 >> 2;
        e2 = ((c1 & 0x3) << 4) | ((c2 || 0) >> 4);
        e3 = ((c2 || 0) & 0xf) << 2 | ((c3 || 0) >> 6);
        e4 = c3 & 0x3f;

        result += chars.charAt(e1) + chars.charAt(e2)
            + (c2 == null ? '=' : chars.charAt(e3))
            + (c3 == null ? '=' : chars.charAt(e4));
    }

    return result;
}

function httpRequest(url, headers, body) {
    var request = new HttpRequest();

    var headerKeys = Object.keys(headers || {});
    for (var i = 0; i < headerKeys.length; i++) {
        request.addHeader(headerKeys[i] + ': ' + headers[headerKeys[i]]);
    }

    var response = request.post(url, body || '');

    return {
        status: request.getStatus(),
        body: response || ''
    };
}

function getToken(idpIssuer, idpClientId, idpClientSecret, idpAudience) {
    var tokenUrl = idpIssuer + '/token';
    var body = 'grant_type=client_credentials'
        + '&client_id=' + encodeURIComponent(idpClientId)
        + '&client_secret=' + encodeURIComponent(idpClientSecret)
        + '&audience=' + encodeURIComponent(idpAudience);

    log('info', 'Step 1: Getting token from ' + tokenUrl);

    var authHeader = 'Basic ' + base64Encode(idpClientId + ':' + idpClientSecret);

    var response = httpRequest(tokenUrl, {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader
    }, body);

    if (response.status !== 200) {
        throw 'Token request failed: ' + response.status + ' ' + response.body;
    }

    var tokenResponse;
    try {
        tokenResponse = JSON.parse(response.body);
    } catch (e) {
        throw 'Token response is not valid JSON: ' + response.body;
    }
    log('info', 'Step 1: Token received (expires in ' + tokenResponse.expires_in + 's)');
    return tokenResponse.access_token;
}

function sendToIngress(ingestUrl, token, recipient, message, format) {
    var payload = {
        recipient: recipient,
        message: message
    };
    if (format) {
        payload.format = format;
    }

    log('info', 'Step 2: Sending to ' + ingestUrl);
    log('info', 'Step 2: Payload: ' + JSON.stringify({ recipient: recipient, messageLength: message.length }));

    var response = httpRequest(ingestUrl, {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
    }, JSON.stringify(payload));

    log('info', 'Step 2: Response status: ' + response.status);
    log('info', 'Step 2: Response body: ' + response.body);

    if (response.status !== 200) {
        throw 'Ingest request failed: ' + response.status + ' ' + response.body;
    }

    var result;
    try {
        result = JSON.parse(response.body);
    } catch (e) {
        throw 'Ingest response is not valid JSON: ' + response.body;
    }
    return result;
}

try {
    var params = JSON.parse(value);

    if (!params.Token) {
        throw 'Incorrect value is given for parameter "Token": parameter is missing';
    }

    if (!params.To) {
        throw 'Incorrect value is given for parameter "To": parameter is missing';
    }

    var alert = buildAlertMessage(params);
    log('info', 'Message built (length: ' + alert.text.length + ', notify: ' + alert.notify + ')');

    var recipientType = (params.RecipientType || 'chat_id').toLowerCase();
    var recipient = {
        kind: recipientType === 'user_id' ? 'user' : 'chat',
        value: params.To
    };
    log('info', 'Recipient: ' + JSON.stringify(recipient));

    var idpIssuer = (params.APIUrl || 'http://localhost:8000').replace(/\/+$/, '');
    var idpClientId = params.ClientId || 'zabbix-bot';
    var idpAudience = params.Audience || 'bot-platform';
    var ingestUrl = params.IngestUrl || 'http://localhost:8443/ingest';

    var token = getToken(idpIssuer, idpClientId, params.Token, idpAudience);

    var format = '';
    if (params.ParseMode) {
        format = params.ParseMode.toLowerCase();
        if (['markdown', 'html'].indexOf(format) === -1) {
            format = '';
        }
    }

    var result = sendToIngress(ingestUrl, token, recipient, alert.text, format);
    log('info', 'Ingest response: ' + JSON.stringify(result));

    return 'OK';
}
catch (error) {
    if (typeof Zabbix !== 'undefined') {
        Zabbix.log(4, '[' + MODULE_NAME + '] notification failed: ' + error);
    }
    throw 'Sending failed: ' + error + '.';
}
