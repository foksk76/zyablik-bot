// SPDX-License-Identifier: Apache-2.0
'use strict';

const crypto = require('node:crypto');

const MODULE_NAME = 'oidc-verifier';
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const JWKS_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const DISCOVERY_PATH = '/.well-known/openid-configuration';
const DEFAULT_JWKS_PATH = '/.well-known/jwks.json';

function createOidcVerifierFactory(options = {}) {
  const logger = options.logger || console;
  const fetchFn = options.fetchFn || globalThis.fetch;

  return function createVerifier({ issuer, audience }) {
    if (issuer.startsWith('http://')) {
      logger.warn(`[${MODULE_NAME}] Using insecure HTTP issuer: ${issuer}`);
    }

    const issuerBaseUrl = issuer.replace(/\/+$/, '');

    let jwks = null;
    let jwksFetchedAt = 0;
    let jwksUriInfo = null;

    // Резолвит jwks_uri против issuer-origin (в т.ч. относительные URL),
    // возвращает абсолютный URL только если protocol+host совпадают с issuer.
    function resolveJwksUriAgainstIssuer(candidateUrl) {
      let resolved;
      try {
        resolved = new URL(candidateUrl, issuerBaseUrl);
      } catch {
        return null;
      }
      if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') {
        return null;
      }
      const base = new URL(issuerBaseUrl);
      if (resolved.protocol !== base.protocol || resolved.host !== base.host) {
        return null;
      }
      return resolved.href;
    }

    function fallbackJwksUri() {
      return issuerBaseUrl + DEFAULT_JWKS_PATH;
    }

    async function resolveJwksUri() {
      const discoveryUrl = issuerBaseUrl + DISCOVERY_PATH;

      let response;
      try {
        response = await fetchFn(discoveryUrl);
      } catch (err) {
        logger.warn(`[${MODULE_NAME}] OIDC discovery failed for ${discoveryUrl}: ${err.message}; using ${DEFAULT_JWKS_PATH}`);
        return { jwksUri: fallbackJwksUri(), discovered: false };
      }

      if (!response.ok) {
        logger.warn(`[${MODULE_NAME}] OIDC discovery returned ${response.status} for ${discoveryUrl}; using ${DEFAULT_JWKS_PATH}`);
        return { jwksUri: fallbackJwksUri(), discovered: false };
      }

      let discovery;
      try {
        discovery = await response.json();
      } catch (err) {
        logger.warn(`[${MODULE_NAME}] OIDC discovery body is not JSON for ${discoveryUrl}; using ${DEFAULT_JWKS_PATH}`);
        return { jwksUri: fallbackJwksUri(), discovered: false };
      }

      const discoveredJwksUri = discovery && typeof discovery.jwks_uri === 'string'
        ? discovery.jwks_uri
        : null;

      if (!discoveredJwksUri) {
        logger.warn(`[${MODULE_NAME}] OIDC discovery for ${discoveryUrl} has no jwks_uri; using ${DEFAULT_JWKS_PATH}`);
        return { jwksUri: fallbackJwksUri(), discovered: false };
      }

      const resolvedJwksUri = resolveJwksUriAgainstIssuer(discoveredJwksUri);
      if (!resolvedJwksUri) {
        logger.warn(`[${MODULE_NAME}] Ignoring jwks_uri on foreign origin: ${discoveredJwksUri}; using ${DEFAULT_JWKS_PATH}`);
        return { jwksUri: fallbackJwksUri(), discovered: false };
      }

      return { jwksUri: resolvedJwksUri, discovered: true };
    }

    // Кешируется только успешный discovery (1 час); сбойный — на короткий
    // отрицательный TTL, чтобы транзиентно недоступный IdP не застревал на час.
    async function getJwksUri() {
      const now = Date.now();
      if (jwksUriInfo) {
        const ttl = jwksUriInfo.discovered ? JWKS_CACHE_TTL_MS : JWKS_NEGATIVE_CACHE_TTL_MS;
        if (now - jwksUriInfo.resolvedAt < ttl) {
          return jwksUriInfo;
        }
      }

      const info = await resolveJwksUri();
      jwksUriInfo = { ...info, resolvedAt: now };
      return jwksUriInfo;
    }

    async function fetchJwks(url) {
      const response = await fetchFn(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch JWKS from ${url}: ${response.status}`);
      }
      return response.json();
    }

    async function getJwks() {
      if (jwks && (Date.now() - jwksFetchedAt) < JWKS_CACHE_TTL_MS) {
        return jwks;
      }

      const { jwksUri, discovered } = await getJwksUri();

      try {
        jwks = await fetchJwks(jwksUri);
      } catch (err) {
        if (!discovered) {
          throw err;
        }
        // Протухший/неверный jwks_uri из discovery — один retry на дефолтный путь.
        const fallbackUrl = fallbackJwksUri();
        logger.warn(`[${MODULE_NAME}] JWKS fetch failed for ${jwksUri}: ${err.message}; retrying ${fallbackUrl}`);
        jwks = await fetchJwks(fallbackUrl);
        jwksUriInfo = { jwksUri: fallbackUrl, discovered: false, resolvedAt: Date.now() };
      }

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
