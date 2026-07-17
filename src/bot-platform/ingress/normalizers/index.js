'use strict';

const { normalizeZabbixEvent } = require('./zabbix');

const normalizers = {
  zabbix: normalizeZabbixEvent
};

function getNormalizer(sourceName) {
  return normalizers[sourceName] || null;
}

module.exports = {
  normalizeZabbixEvent,
  getNormalizer
};
