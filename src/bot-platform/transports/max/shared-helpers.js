'use strict';

function normalizeHttpResponse(response) {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    return {
      statusCode: Number.isInteger(response.statusCode) ? response.statusCode : 200,
      body: Object.prototype.hasOwnProperty.call(response, 'body') ? response.body : response
    };
  }

  return {
    statusCode: 200,
    body: response
  };
}

function createLogger(logger) {
  if (logger && typeof logger.info === 'function') {
    return logger;
  }

  return {
    info() {}
  };
}

module.exports = {
  normalizeHttpResponse,
  createLogger
};
