const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { createBotPlatformApp, createIssuerVerifierFactory } = require('../../src/bot-platform/app');
const { createJwtSourceAuth } = require('../../src/bot-platform/ingress/jwt-source-auth');

const { envWithoutConfig } = require('../helpers/env-no-config');
const createApp = (env = {}) => createBotPlatformApp(envWithoutConfig(env));

function b64url(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function createJwt(privateKeyJwk, kid, issuer, audience, claimName, claimValue) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', kid, typ: 'JWT' };
    const payload = { iss: issuer, sub: 'user-123', aud: audience, iat: now, exp: now + 3600, [claimName]: [claimValue] };
    const headerB64 = b64url(header);
    const payloadB64 = b64url(payload);
    const signingInput = `${headerB64}.${payloadB64}`;
    const privateKey = crypto.createPrivateKey({ key: privateKeyJwk, format: 'jwk' });
    const sig = crypto.sign('sha256', Buffer.from(signingInput), privateKey)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    return `${headerB64}.${payloadB64}.${sig}`;
}

test('createBotPlatformApp returns app object with config', () => {
  const app = createApp({});
  assert.equal(app.name, 'zyablik-bot-platform');
  assert.equal(app.status, 'scaffold');
  assert.ok(app.core);
  assert.ok(app.core.config);
});

test('config has ingress defaults when env is empty', () => {
  const app = createApp({});
  assert.equal(app.core.config.ingressEnabled, false);
  assert.equal(app.core.config.ingressPort, 8443);
  assert.equal(app.core.config.idpIssuer, '');
  assert.equal(app.core.config.idpAudience, '');
});

test('config reads ingress env overrides', () => {
  const app = createApp({
    INGRESS_ENABLED: 'true',
    INGRESS_PORT: '9443',
    IDP_ISSUER: 'https://synthetic.idp.com',
    IDP_AUDIENCE: 'synthetic-audience'
  });
  assert.equal(app.core.config.ingressEnabled, true);
  assert.equal(app.core.config.ingressPort, 9443);
  assert.equal(app.core.config.idpIssuer, 'https://synthetic.idp.com');
  assert.equal(app.core.config.idpAudience, 'synthetic-audience');
});

test('config has queue defaults when env is empty', () => {
  const app = createApp({});
  assert.equal(app.core.config.queueEnabled, false);
  assert.equal(app.core.config.queueMaxAttempts, 5);
  assert.equal(app.core.config.queueIntervalMs, 5000);
});

test('config reads queue env overrides', () => {
  const app = createApp({
    QUEUE_ENABLED: 'true',
    QUEUE_MAX_ATTEMPTS: '10',
    QUEUE_INTERVAL_MS: '2000'
  });
  assert.equal(app.core.config.queueEnabled, true);
  assert.equal(app.core.config.queueMaxAttempts, 10);
  assert.equal(app.core.config.queueIntervalMs, 2000);
});

test('app preserves backward compatibility with empty env', () => {
  const app = createApp({});
  assert.equal(app.core.config.maxTransportMode, 'long_polling');
  assert.equal(app.pipeline.transportMode, 'long_polling');
  assert.equal(app.pipeline.dryRun, 'available');
});

test('createIssuerVerifierFactory returns null for empty issuer', () => {
  assert.equal(createIssuerVerifierFactory(''), null);
  assert.equal(createIssuerVerifierFactory(undefined), null);
});

test('createIssuerVerifierFactory uses hand-rolled oidc-verifier for https issuer (ADR-0038)', () => {
  // Регрессия: раньше для https-issuer возвращался null, и jwt-source-auth
  // падал на @okta/jwt-verifier c жёстко зашитым issuer + '/v1/keys' (Okta-specific).
  // NanoIDP отдаёт ключи на /.well-known/jwks.json, поэтому Okta-verifier не мог
  // разрешить kid → все /ingest отвечали 401.
  const factory = createIssuerVerifierFactory('https://idp.example.com');
  assert.equal(typeof factory, 'function');
  const verifier = factory({ issuer: 'https://idp.example.com', audience: 'aud' });
  assert.equal(typeof verifier.verifyAccessToken, 'function');
});

test('createIssuerVerifierFactory uses hand-rolled oidc-verifier for http issuer', () => {
  const factory = createIssuerVerifierFactory('http://idp.example.com:8000');
  assert.equal(typeof factory, 'function');
  const verifier = factory({ issuer: 'http://idp.example.com:8000', audience: 'aud' });
  assert.equal(typeof verifier.verifyAccessToken, 'function');
});

test('ingress wiring: createJwtSourceAuth + hand-rolled verifier authenticates https-issuer token', async () => {
  // E2E-регрессия (ADR-0038 review fix 1): раньше для https-issuer createIssuerVerifierFactory
  // возвращал null, jwt-source-auth падал на @okta/jwt-verifier (жёсткий issuer + '/v1/keys'),
  // kid не резолвился — /ingest отвечал 401. Теперь рукописный verifier проходит OIDC discovery
  // (openid-configuration → jwks_uri) и проверяет подпись токена.
  const keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
    publicKeyEncoding: { type: 'spki', format: 'jwk' }
  });
  const kid = 'e2e-kid-1';
  const jwksBody = {
    keys: [{ kid, kty: keyPair.publicKey.kty, n: keyPair.publicKey.n, e: keyPair.publicKey.e, alg: 'RS256', use: 'sig' }]
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/.well-known/openid-configuration')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/.well-known/jwks.json' })
      };
    }
    return { ok: true, status: 200, json: async () => jwksBody };
  };

  try {
    const logger = { info() {}, error() {}, warn() {} };
    const auth = createJwtSourceAuth({
      issuer: 'https://idp.example.com',
      audience: 'aud',
      claimName: 'entitlements',
      claimValue: 'zabbix',
      logger,
      verifierFactory: createIssuerVerifierFactory('https://idp.example.com', logger)
    });

    const token = createJwt(keyPair.privateKey, kid, 'https://idp.example.com', 'aud', 'entitlements', 'zabbix');
    const result = await auth.authenticate(`Bearer ${token}`);

    assert.deepEqual(result, { source: 'zabbix' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
