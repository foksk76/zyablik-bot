// SPDX-License-Identifier: Apache-2.0
'use strict';

const { handleIdentityEvent } = require('./handler');
const { formatIdentityResponse } = require('./formatter');

module.exports = {
  name: 'identity',
  routes: {
    identity: handleIdentityEvent
  },
  // ADR-0046: первый пример configSchema — минимальная демонстрация
  // механизма. Рантайм-настроек у identity нет (плагин — только
  // name/routes), блок IdP-регистрации (IDP_ISSUER/IDP_CLIENT_ID/...) — это
  // «неизменяемая база» env (ADR-0045) и в файл/схему не переносится.
  // Поэтому ветка plugins.identity.* в merged-схеме пустая.
  configSchema: {},
  formatIdentityResponse,
  handleIdentityEvent
};
