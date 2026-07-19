// SPDX-License-Identifier: Apache-2.0
var Max = {
    token: null,
    to: null,
    message: null,
    proxy: null,
    parse_mode: null,
    notify: true,
    api_url: 'https://platform-api2.max.ru/messages',
    recipient_type: 'chat_id',

    escapeMarkup: function (str, mode) {
        switch (mode) {
            case 'markdown':
                return str.replace(/([_*\[`])/g, '\\$&');

            default:
                return str;
        }
    },

    sendMessage: function () {
        var params = {
            text: Max.message,
            notify: Max.notify
        },
        data,
        response,
        request = new HttpRequest(),
        url;

        if (Max.parse_mode !== null) {
            params['format'] = Max.parse_mode;
        }

        url = Max.api_url + '?' + Max.recipient_type + '=' + encodeURIComponent(Max.to);

        if (Max.proxy) {
            request.setProxy(Max.proxy);
        }

        request.addHeader('Content-Type: application/json');
        request.addHeader('Authorization: ' + Max.token);

        data = JSON.stringify(params);

        Zabbix.log(4, '[MAX Webhook] URL: ' + url);
        Zabbix.log(4, '[MAX Webhook] params: ' + data);

        response = request.post(url, data);

        Zabbix.log(4, '[MAX Webhook] HTTP code: ' + request.getStatus());
        Zabbix.log(4, '[MAX Webhook] response: ' + response);

        try {
            response = JSON.parse(response);
        }
        catch (error) {
            response = null;
        }

        if (request.getStatus() < 200 || request.getStatus() >= 300) {
            if (response && typeof response.message === 'string') {
                throw response.message;
            }
            else if (response && typeof response.error === 'string') {
                throw response.error;
            }
            else {
                throw 'Unknown error. Check debug log for more information.';
            }
        }
    }
};

var buildAlertMessage = require('../shared/zabbix-message').buildAlertMessage;

try {
    var params = JSON.parse(value);

    if (typeof params.Token === 'undefined' || params.Token === '') {
        throw 'Incorrect value is given for parameter "Token": parameter is missing';
    }

    if (typeof params.To === 'undefined' || params.To === '') {
        throw 'Incorrect value is given for parameter "To": parameter is missing';
    }

    Max.token = params.Token;
    Max.to = params.To;

    if (params.APIUrl) {
        Max.api_url = params.APIUrl;
    }

    if (params.HTTPProxy) {
        Max.proxy = params.HTTPProxy;
    }

    if (params.RecipientType) {
        params.RecipientType = params.RecipientType.toLowerCase();

        if (['chat_id', 'user_id'].indexOf(params.RecipientType) !== -1) {
            Max.recipient_type = params.RecipientType;
        }
        else {
            throw 'Incorrect value is given for parameter "RecipientType": supported values are "chat_id" and "user_id"';
        }
    }

    if (params.ParseMode) {
        params.ParseMode = params.ParseMode.toLowerCase();

        if (['markdown', 'html'].indexOf(params.ParseMode) !== -1) {
            Max.parse_mode = params.ParseMode;
        }
    }

    var alert = buildAlertMessage(params);
    Max.message = alert.text;
    Max.notify = alert.notify;

    if (params.ParseMode === 'markdown') {
        Max.message = Max.escapeMarkup(Max.message, params.ParseMode);
    }

    Max.sendMessage();

    return 'OK';
}
catch (error) {
    Zabbix.log(4, '[MAX Webhook] notification failed: ' + error);
    throw 'Sending failed: ' + error + '.';
}
