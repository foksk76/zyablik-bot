const test = require('node:test');
const assert = require('node:assert/strict');

const { createJwtSourceAuth } = require('../../src/bot-platform/ingress/jwt-source-auth');

function createMockVerifierFactory(shouldFail = false, failMessage = 'verification failed', claims = {}) {
  return (options) => ({
    verifyAccessToken: async (token, audience) => {
      if (shouldFail) {
        throw new Error(failMessage);
      }
      return {
        claims: {
          bot_source: 'zabbix',
          sub: 'test-user',
          ...claims
        }
      };
    }
  });
}

test('createJwtSourceAuth returns object with authenticate method', () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.okta.com',
    verifierFactory: createMockVerifierFactory()
  });
  assert.equal(typeof auth.authenticate, 'function');
});

test('authenticate returns source from valid JWT', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.okta.com',
    audience: 'synthetic-audience',
    verifierFactory: createMockVerifierFactory()
  });

  const result = await auth.authenticate('Bearer synthetic-jwt-token');
  assert.equal(result.source, 'zabbix');
});

test('authenticate throws on null header', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.okta.com',
    verifierFactory: createMockVerifierFactory()
  });

  await assert.rejects(
    () => auth.authenticate(null),
    /Missing Authorization header/
  );
});

test('authenticate throws on invalid format', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.okta.com',
    verifierFactory: createMockVerifierFactory()
  });

  await assert.rejects(
    () => auth.authenticate('invalid'),
    /Invalid Authorization header format/
  );
});

test('authenticate throws on missing Bearer token', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.okta.com',
    verifierFactory: createMockVerifierFactory()
  });

  await assert.rejects(
    () => auth.authenticate('Bearer '),
    /Missing Bearer token/
  );
});

test('authenticate throws on verification failure', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.okta.com',
    verifierFactory: createMockVerifierFactory(true, 'token expired')
  });

  await assert.rejects(
    () => auth.authenticate('Bearer invalid-token'),
    /JWT verification failed/
  );
});

test('authenticate throws when bot_source claim is missing', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.okta.com',
    verifierFactory: createMockVerifierFactory(false, '', { bot_source: undefined })
  });

  await assert.rejects(
    () => auth.authenticate('Bearer token-without-source'),
    /Missing bot_source claim/
  );
});

test('authenticate throws when verifier is not configured', async () => {
  const auth = createJwtSourceAuth({ issuer: '' });

  await assert.rejects(
    () => auth.authenticate('Bearer some-token'),
    /JWT verifier not configured/
  );
});

test('authenticate returns custom source from bot_source claim', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.okta.com',
    verifierFactory: createMockVerifierFactory(false, '', { bot_source: 'siem' })
  });

  const result = await auth.authenticate('Bearer valid-token');
  assert.equal(result.source, 'siem');
});
