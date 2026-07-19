'use strict';

const { createJwtSourceAuth } = require('./jwt-source-auth');
const { getNormalizer } = require('./normalizers');
const { createIngressHttpServer } = require('./http-server');

const MODULE_NAME = 'ingress';

function createIngressPipeline(options = {}) {
  const port = options.port || 8443;
  const issuer = options.issuer || '';
  const audience = options.audience || '';
  const claimName = options.claimName || '';
  const claimValue = options.claimValue || '';
  const queueStore = options.queueStore || null;
  const outboundClient = options.outboundClient;
  const logger = options.logger || console;

  const jwtAuth = createJwtSourceAuth({
    issuer,
    audience,
    claimName: claimName || undefined,
    claimValue: claimValue || undefined,
    logger,
    verifierFactory: options.verifierFactory || null
  });

  const normalizerRegistry = {
    getNormalizer
  };

  const server = createIngressHttpServer({
    port,
    jwtAuth,
    normalizerRegistry,
    queueStore,
    outboundClient,
    logger,
    logAudit: options.logAudit,
    logTrace: options.logTrace
  });

  function start() {
    return server.start();
  }

  function stop() {
    return server.stop();
  }

  return {
    start,
    stop
  };
}

module.exports = {
  MODULE_NAME,
  createIngressPipeline
};
