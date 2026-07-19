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
    issuer: 'https://synthetic.idp.example.com',
    verifierFactory: createMockVerifierFactory()
  });
  assert.equal(typeof auth.authenticate, 'function');
});

test('authenticate returns source from valid JWT', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.example.com',
    audience: 'synthetic-audience',
    verifierFactory: createMockVerifierFactory()
  });

  const result = await auth.authenticate('Bearer synthetic-jwt-token');
  assert.equal(result.source, 'zabbix');
});

test('authenticate throws on null header', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.example.com',
    verifierFactory: createMockVerifierFactory()
  });

  await assert.rejects(
    () => auth.authenticate(null),
    /Missing Authorization header/
  );
});

test('authenticate throws on invalid format', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.example.com',
    verifierFactory: createMockVerifierFactory()
  });

  await assert.rejects(
    () => auth.authenticate('invalid'),
    /Invalid Authorization header format/
  );
});

test('authenticate throws on missing Bearer token', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.example.com',
    verifierFactory: createMockVerifierFactory()
  });

  await assert.rejects(
    () => auth.authenticate('Bearer '),
    /Missing Bearer token/
  );
});

test('authenticate throws on verification failure', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.example.com',
    verifierFactory: createMockVerifierFactory(true, 'token expired')
  });

  await assert.rejects(
    () => auth.authenticate('Bearer invalid-token'),
    /JWT verification failed/
  );
});

test('authenticate throws when bot_source claim is missing', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.example.com',
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
    issuer: 'https://synthetic.idp.example.com',
    verifierFactory: createMockVerifierFactory(false, '', { bot_source: 'siem' })
  });

  const result = await auth.authenticate('Bearer valid-token');
  assert.equal(result.source, 'siem');
});

test('authenticate returns source from array claim when claimValue matches', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.local',
    claimName: 'entitlements',
    claimValue: 'ZABBIX',
    verifierFactory: createMockVerifierFactory(false, '', {
      entitlements: ['ADMIN_ACCESS', 'ZABBIX']
    })
  });

  const result = await auth.authenticate('Bearer token');
  assert.equal(result.source, 'ZABBIX');
});

test('authenticate throws when array claim does not contain claimValue', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.local',
    claimName: 'entitlements',
    claimValue: 'ZABBIX',
    verifierFactory: createMockVerifierFactory(false, '', {
      entitlements: ['ADMIN_ACCESS']
    })
  });

  await assert.rejects(
    () => auth.authenticate('Bearer token'),
    /Missing entitlements claim/
  );
});

test('authenticate throws when array claim is missing entirely with claimValue', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.local',
    claimName: 'entitlements',
    claimValue: 'ZABBIX',
    verifierFactory: createMockVerifierFactory(false, '', {
      roles: ['ADMIN']
    })
  });

  await assert.rejects(
    () => auth.authenticate('Bearer token'),
    /Missing entitlements claim/
  );
});

test('authenticate uses custom claimName in error message', async () => {
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.local',
    claimName: 'source_system',
    verifierFactory: createMockVerifierFactory(false, '', { source_system: undefined })
  });

  await assert.rejects(
    () => auth.authenticate('Bearer token'),
    /Missing source_system claim/
  );
});

test('authenticate with reqId logs audit auth success', async () => {
  const logEntries = [];
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.example.com',
    verifierFactory: createMockVerifierFactory(),
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  await auth.authenticate('Bearer token', { reqId: 'req-123', ip: '127.0.0.1' });

  const successLog = logEntries.find((e) => typeof e === 'string' && e.includes('auth success'));
  assert.ok(successLog, 'should have auth success audit log');
  assert.ok(successLog.includes('req-123'), 'should include reqId');
});

test('authenticate with reqId logs audit auth failed', async () => {
  const logEntries = [];
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.example.com',
    verifierFactory: createMockVerifierFactory(),
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  await assert.rejects(
    () => auth.authenticate(null, { reqId: 'req-456', ip: '10.0.0.1' }),
    /Missing Authorization header/
  );

  const failLog = logEntries.find((e) => typeof e === 'string' && e.includes('auth failed'));
  assert.ok(failLog, 'should have auth failed audit log');
  assert.ok(failLog.includes('req-456'), 'should include reqId');
});

test('authenticate without reqId works without audit log', async () => {
  const logEntries = [];
  const auth = createJwtSourceAuth({
    issuer: 'https://synthetic.idp.example.com',
    verifierFactory: createMockVerifierFactory(),
    logger: { info: (msg) => logEntries.push(msg), error: () => {} }
  });

  const result = await auth.authenticate('Bearer token');
  assert.equal(result.source, 'zabbix');
  assert.equal(logEntries.length, 0, 'should not log audit without reqId');
});
