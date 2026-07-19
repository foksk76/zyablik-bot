// SPDX-License-Identifier: Apache-2.0
'use strict';

const { formatLogLine } = require('../core/logger');

const MODULE_NAME = 'jwt-source-auth';

function createJwtSourceAuth(options = {}) {
  const issuer = options.issuer || '';
  const audience = options.audience || '';
  const claimName = options.claimName || 'bot_source';
  const claimValue = options.claimValue || '';
  const logger = options.logger || console;
  const verifierFactory = options.verifierFactory || null;

  let verifier = null;

  function getVerifier() {
    if (!verifier && issuer) {
      if (verifierFactory) {
        verifier = verifierFactory({ issuer, audience });
      } else {
        const OktaJwtVerifier = require('@okta/jwt-verifier');
        verifier = new OktaJwtVerifier({
          issuer,
          assertClaims: audience ? { aud: audience } : undefined
        });
      }
    }
    return verifier;
  }

  function resolveSource(claims) {
    if (!claims) return null;

    const claim = claims[claimName];

    if (!claim) return null;

    if (claimValue) {
      if (Array.isArray(claim)) {
        return claim.includes(claimValue) ? claimValue : null;
      }
      return claim === claimValue ? claimValue : null;
    }

    return claim;
  }

  async function authenticate(authorizationHeader, options = {}) {
    const { reqId, ip } = options;

    if (!authorizationHeader || typeof authorizationHeader !== 'string') {
      if (reqId) {
        logger.info(formatLogLine({
          level: 'info',
          module: MODULE_NAME,
          reqId,
          action: 'auth failed',
          context: { reason: 'Missing Authorization header', ip }
        }));
      }
      throw new Error('Missing Authorization header');
    }

    const parts = authorizationHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      if (reqId) {
        logger.info(formatLogLine({
          level: 'info',
          module: MODULE_NAME,
          reqId,
          action: 'auth failed',
          context: { reason: 'Invalid Authorization header format', ip }
        }));
      }
      throw new Error('Invalid Authorization header format');
    }

    const token = parts[1];

    if (!token) {
      if (reqId) {
        logger.info(formatLogLine({
          level: 'info',
          module: MODULE_NAME,
          reqId,
          action: 'auth failed',
          context: { reason: 'Missing Bearer token', ip }
        }));
      }
      throw new Error('Missing Bearer token');
    }

    const tokenVerifier = getVerifier();

    if (!tokenVerifier) {
      if (reqId) {
        logger.info(formatLogLine({
          level: 'info',
          module: MODULE_NAME,
          reqId,
          action: 'auth failed',
          context: { reason: 'JWT verifier not configured', ip }
        }));
      }
      throw new Error('JWT verifier not configured');
    }

    try {
      const jwt = await tokenVerifier.verifyAccessToken(token, audience);

      const source = resolveSource(jwt.claims);

      if (!source) {
        if (reqId) {
          logger.info(formatLogLine({
            level: 'info',
            module: MODULE_NAME,
            reqId,
            action: 'auth failed',
            context: { reason: `Missing ${claimName} claim`, ip }
          }));
        }
        throw new Error(`Missing ${claimName} claim`);
      }

      if (reqId) {
        logger.info(formatLogLine({
          level: 'info',
          module: MODULE_NAME,
          reqId,
          action: 'auth success',
          context: { sub: jwt.claims && jwt.claims.sub, source, ip }
        }));
      }

      return { source };
    } catch (error) {
      if (error.message === `Missing ${claimName} claim`) {
        throw error;
      }
      logger.error(formatLogLine({
        level: 'error',
        module: MODULE_NAME,
        reqId,
        action: 'jwt verification failed',
        context: { reason: error.message, ip }
      }));
      if (reqId) {
        logger.info(formatLogLine({
          level: 'info',
          module: MODULE_NAME,
          reqId,
          action: 'auth failed',
          context: { reason: error.message, ip }
        }));
      }
      throw new Error('JWT verification failed');
    }
  }

  return {
    authenticate
  };
}

module.exports = {
  MODULE_NAME,
  createJwtSourceAuth
};
