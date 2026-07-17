'use strict';

const MODULE_NAME = 'jwt-source-auth';

function createJwtSourceAuth(options = {}) {
  const issuer = options.issuer || '';
  const audience = options.audience || '';
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

  async function authenticate(authorizationHeader) {
    if (!authorizationHeader || typeof authorizationHeader !== 'string') {
      throw new Error('Missing Authorization header');
    }

    const parts = authorizationHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new Error('Invalid Authorization header format');
    }

    const token = parts[1];

    if (!token) {
      throw new Error('Missing Bearer token');
    }

    const oktaVerifier = getVerifier();

    if (!oktaVerifier) {
      throw new Error('JWT verifier not configured');
    }

    try {
      const jwt = await oktaVerifier.verifyAccessToken(token, audience);

      const source = jwt.claims && jwt.claims.bot_source;

      if (!source) {
        throw new Error('Missing bot_source claim');
      }

      return { source };
    } catch (error) {
      if (error.message === 'Missing bot_source claim') {
        throw error;
      }
      logger.error(`[${MODULE_NAME}] JWT verification failed: ${error.message}`);
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
