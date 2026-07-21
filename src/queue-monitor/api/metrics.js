// SPDX-License-Identifier: Apache-2.0
'use strict';

const MODULE_NAME = 'queue-monitor-metrics';

function createMetricsRoutes(options = {}) {
  const reader = options.reader;

  if (!reader) {
    throw new Error('reader is required');
  }

  function summary(_ctx) {
    const data = reader.summary();
    return {
      statusCode: 200,
      body: {
        status: 'ok',
        total: data.total,
        pending: data.pending,
        processing: data.processing,
        delivered: data.delivered,
        failed: data.failed,
        totalAttempts: data.totalAttempts
      }
    };
  }

  function discovery(_ctx) {
    return {
      statusCode: 200,
      body: {
        status: 'ok',
        data: [
          {
            '{#METRIC}': 'queue.pending',
            '{#METRIC_LABEL}': 'Ожидают отправки'
          },
          {
            '{#METRIC}': 'queue.processing',
            '{#METRIC_LABEL}': 'В обработке'
          },
          {
            '{#METRIC}': 'queue.delivered',
            '{#METRIC_LABEL}': 'Доставлено'
          },
          {
            '{#METRIC}': 'queue.failed',
            '{#METRIC_LABEL}': 'Ошибки'
          },
          {
            '{#METRIC}': 'queue.total',
            '{#METRIC_LABEL}': 'Всего сообщений'
          },
          {
            '{#METRIC}': 'queue.totalAttempts',
            '{#METRIC_LABEL}': 'Всего попыток'
          }
        ]
      }
    };
  }

  return {
    summary,
    discovery
  };
}

module.exports = {
  MODULE_NAME,
  createMetricsRoutes
};
