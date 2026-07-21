// SPDX-License-Identifier: Apache-2.0
'use strict';

const MODULE_NAME = 'queue-monitor-metrics';
const MAX_LIMIT = 100;

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
            '{#LABEL}': 'Ожидают отправки'
          },
          {
            '{#METRIC}': 'queue.processing',
            '{#LABEL}': 'В обработке'
          },
          {
            '{#METRIC}': 'queue.delivered',
            '{#LABEL}': 'Доставлено'
          },
          {
            '{#METRIC}': 'queue.failed',
            '{#LABEL}': 'Ошибки'
          },
          {
            '{#METRIC}': 'queue.total',
            '{#LABEL}': 'Всего сообщений'
          },
          {
            '{#METRIC}': 'queue.totalAttempts',
            '{#LABEL}': 'Всего попыток'
          }
        ]
      }
    };
  }

  function timeseries(ctx) {
    const windowSeconds = parseInt(ctx.query.window, 10) || 0;
    const data = reader.timeseries(windowSeconds);
    return {
      statusCode: 200,
      body: {
        status: 'ok',
        window: windowSeconds,
        data
      }
    };
  }

  function top(ctx) {
    const by = ctx.query.by || 'source';
    const limit = Math.min(parseInt(ctx.query.limit, 10) || 5, MAX_LIMIT);

    if (by === 'recipient') {
      const data = reader.topRecipient(limit);
      return {
        statusCode: 200,
        body: { status: 'ok', by, limit, data }
      };
    }

    const data = reader.topSource(limit);
    return {
      statusCode: 200,
      body: { status: 'ok', by, limit, data }
    };
  }

  function errors(ctx) {
    const limit = Math.min(parseInt(ctx.query.limit, 10) || 20, MAX_LIMIT);
    const data = reader.errors(limit);
    return {
      statusCode: 200,
      body: {
        status: 'ok',
        limit,
        data
      }
    };
  }

  return {
    summary,
    discovery,
    timeseries,
    top,
    errors
  };
}

module.exports = {
  MODULE_NAME,
  createMetricsRoutes
};
