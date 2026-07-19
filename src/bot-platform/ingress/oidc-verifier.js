// SPDX-License-Identifier: Apache-2.0
'use strict';

const crypto = require('node:crypto');

const MODULE_NAME = 'oidc-verifier';
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

function createOidcVerifierFactory(options = {}) {
  const logger = options.logger || console;
  const fetchFn = options.fetchFn || globalThis.fetch;

  return function createVerifier({ issuer, audience }) {
    if (issuer.startsWith('http://')) {
      logger.warn(`[${MODULE_NAME}] Using insecure HTTP issuer: ${issuer}`);
    }

    let jwks = null;
    let jwksFetchedAt = 0;

    async function getJwks() {
      if (jwks && (Date.now() - jwksFetchedAt) < JWKS_CACHE_TTL_MS) {
        return jwks;
      }

      const url = issuer.replace(/\/+$/, '') + '/.well-known/jwks.json';
      const response = await fetchFn(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch JWKS from ${url}: ${response.status}`);
      }

      jwks = await response.json();
      jwksFetchedAt = Date.now();
      return jwks;
    }

    function findKey(kid) {
      return jwks && jwks.keys && jwks.keys.find((k) => k.kid === kid);
    }

    function importKey(jwk) {
      return crypto.createPublicKey({
        key: jwk,
        format: 'jwk'
      });
    }

    function base64UrlDecode(str) {
      const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      return Buffer.from(padded, 'base64');
    }

    function parseJwt(token) {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
      const payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
      const signature = base64UrlDecode(parts[2]);

      return { header, payload, signature, signingInput: parts[0] + '.' + parts[1] };
    }

    async function verifyAccessToken(token, expectedAudience) {
      const { header, payload, signature, signingInput } = parseJwt(token);

      if (!header.kid) {
        throw new Error('JWT header missing kid');
      }

      let keyJwk = findKey(header.kid);
      if (!keyJwk) {
        await getJwks();
        keyJwk = findKey(header.kid);
        if (!keyJwk) {
          throw new Error(`Key not found in JWKS: ${header.kid}`);
        }
      }

      const key = importKey(keyJwk);

      const algMap = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512' };
      const algorithm = algMap[header.alg];

      if (!algorithm) {
        throw new Error(`Unsupported algorithm: ${header.alg}`);
      }

      const valid = crypto.verify(
        algorithm,
        Buffer.from(signingInput),
        key,
        signature
      );

      if (!valid) {
        throw new Error('Invalid JWT signature');
      }

      const now = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }

      if (payload.iat && payload.iat > now) {
        throw new Error('Token issued in the future');
      }

      if (issuer && payload.iss !== issuer) {
        throw new Error(`Invalid issuer: expected ${issuer}, got ${payload.iss}`);
      }

      if (expectedAudience) {
        const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!aud.includes(expectedAudience)) {
          throw new Error(`Invalid audience: expected ${expectedAudience}`);
        }
      }

      return { claims: payload };
    }

    return { verifyAccessToken };
  };
}

module.exports = {
  MODULE_NAME,
  createOidcVerifierFactory
};
