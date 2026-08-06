// SPDX-License-Identifier: Apache-2.0
const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { MODULE_NAME, createOidcVerifierFactory } = require('../../src/bot-platform/ingress/oidc-verifier');

// ---------------------------------------------------------------------------
// Helpers: RSA key generation + JWK export
// ---------------------------------------------------------------------------

let keyPair;
let publicKeyJwk;

function ensureKeyPair() {
    if (keyPair) return;
    keyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
        publicKeyEncoding: { type: 'spki', format: 'jwk' }
    });
    publicKeyJwk = keyPair.publicKey;
}

// ---------------------------------------------------------------------------
// Helpers: JWT creation (base64url)
// ---------------------------------------------------------------------------

function base64UrlEncode(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return Buffer.from(str)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function createJwt(privateKeyJwk, header, payload) {
    const headerB64 = base64UrlEncode(header);
    const payloadB64 = base64UrlEncode(payload);
    const signingInput = `${headerB64}.${payloadB64}`;

    const privateKey = crypto.createPrivateKey({ key: privateKeyJwk, format: 'jwk' });
    const algMap = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512' };
    const sig = crypto.sign(algMap[header.alg], Buffer.from(signingInput), privateKey);
    const sigB64 = sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return `${headerB64}.${payloadB64}.${sigB64}`;
}

function makeHeader(alg = 'RS256', kid = 'test-kid-1') {
    return { alg, kid, typ: 'JWT' };
}

function makePayload(overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    return {
        iss: 'https://idp.example.com',
        sub: 'user-123',
        aud: 'test-audience',
        iat: now,
        exp: now + 3600,
        ...overrides
    };
}

// ---------------------------------------------------------------------------
// Helpers: mock JWKS endpoint
// ---------------------------------------------------------------------------

function createJwksResponse(kid = 'test-kid-1', jwk = null) {
    ensureKeyPair();
    return {
        keys: [{
            kid,
            kty: jwk?.kty || publicKeyJwk.kty,
            n: jwk?.n || publicKeyJwk.n,
            e: jwk?.e || publicKeyJwk.e,
            alg: 'RS256',
            use: 'sig'
        }]
    };
}

function createMockFetch(jwksBody, status = 200, { discoveryStatus = 200, discoveryBody = null } = {}) {
    let callCount = 0;
    let discoveryCallCount = 0;
    let jwksCallCount = 0;
    return {
        fetch: async (url) => {
            callCount++;
            const u = String(url);
            if (u.includes('/.well-known/openid-configuration')) {
                discoveryCallCount++;
                const ok = discoveryStatus >= 200 && discoveryStatus < 300;
                const body = discoveryBody || {
                    issuer: u.replace('/.well-known/openid-configuration', ''),
                    jwks_uri: u.replace('/.well-known/openid-configuration', '/.well-known/jwks.json')
                };
                return { ok, status: discoveryStatus, json: async () => body };
            }
            jwksCallCount++;
            return {
                ok: status >= 200 && status < 300,
                status,
                json: async () => jwksBody
            };
        },
        getCallCount: () => callCount,
        getDiscoveryCallCount: () => discoveryCallCount,
        getJwksCallCount: () => jwksCallCount
    };
}

function createRotatingJwksFetch(jwksBodies) {
    let jwksCount = 0;
    return {
        fetch: async (url) => {
            const u = String(url);
            if (u.includes('/.well-known/openid-configuration')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        issuer: 'https://idp.example.com',
                        jwks_uri: 'https://idp.example.com/.well-known/jwks.json'
                    })
                };
            }
            const body = jwksBodies[Math.min(jwksCount, jwksBodies.length - 1)];
            jwksCount++;
            return { ok: true, status: 200, json: async () => body };
        },
        getJwksCallCount: () => jwksCount
    };
}

function createMockLogger() {
    const warns = [];
    const infos = [];
    return {
        warns,
        infos,
        warn(msg) { warns.push(msg); },
        info(msg) { infos.push(msg); }
    };
}

// ---------------------------------------------------------------------------
// MODULE_NAME
// ---------------------------------------------------------------------------

test('MODULE_NAME is exported and equals "oidc-verifier"', () => {
    assert.equal(MODULE_NAME, 'oidc-verifier');
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('valid RS256 JWT returns claims', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com', audience: 'test-audience' });

    const token = createJwt(keyPair.privateKey, makeHeader('RS256'), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims, 'should return claims');
    assert.equal(result.claims.sub, 'user-123');
    assert.equal(result.claims.iss, 'https://idp.example.com');
});

test('valid RS384 JWT returns claims', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader('RS384'), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
});

test('valid RS512 JWT returns claims', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader('RS512'), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
});

test('JWT with audience claim is checked', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com', audience: 'correct-aud' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ aud: 'correct-aud' }));
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
});

test('JWT with issuer claim is checked', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iss: 'https://idp.example.com' }));
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
});

test('JWKS cache hit — second call does not re-fetch', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch, getCallCount } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());

    await verifier.verifyAccessToken(token);
    assert.equal(getCallCount(), 2, 'should fetch OIDC discovery + JWKS on first call');

    await verifier.verifyAccessToken(token);
    assert.equal(getCallCount(), 2, 'should not re-fetch on second call (cache hit)');
});

test('JWKS cache miss — kid found after re-fetch (happy path refresh)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();

    // V1 has kid "rotated-kid", V2 has kid "new-kid"
    const jwksBodyV1 = {
        keys: [{ kid: 'rotated-kid', kty: publicKeyJwk.kty, n: publicKeyJwk.n, e: publicKeyJwk.e, alg: 'RS256', use: 'sig' }]
    };
    const jwksBodyV2 = createJwksResponse('new-kid');

    const { fetch: mockFetch, getJwksCallCount } = createRotatingJwksFetch([jwksBodyV1, jwksBodyV2]);

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    // First call: token with kid "rotated-kid" — found in v1 JWKS
    const tokenV1 = createJwt(keyPair.privateKey, makeHeader('RS256', 'rotated-kid'), makePayload());
    const result1 = await verifier.verifyAccessToken(tokenV1);
    assert.ok(result1.claims);
    assert.equal(getJwksCallCount(), 1, 'should fetch JWKS on first call');

    // Force cache expiry so next call re-fetches
    // TODO: import JWKS_CACHE_TTL_MS from oidc-verifier.js if module exports it
    // NOTE: JWKS_CACHE_TTL_MS must match the value in oidc-verifier.js (60 * 60 * 1000).
    // If the source constant changes, update this value to keep tests deterministic.
    const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    try {
        currentTime += JWKS_CACHE_TTL_MS + 1;

        // Second call: token with kid "new-kid" — not in v1, re-fetch returns v2
        const tokenV2 = createJwt(keyPair.privateKey, makeHeader('RS256', 'new-kid'), makePayload({ exp: Math.floor(currentTime / 1000) + 3600, iat: Math.floor(currentTime / 1000) }));
        const result2 = await verifier.verifyAccessToken(tokenV2);
        assert.ok(result2.claims);
        assert.equal(getJwksCallCount(), 2, 'should re-fetch when kid not found and cache expired');
    } finally {
        dateMock.mock.restore();
    }
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

test('invalid JWT format (not 3 parts) throws', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    await assert.rejects(
        () => verifier.verifyAccessToken('not-a-jwt'),
        (err) => {
            assert.equal(err.message, 'Invalid JWT format');
            return true;
        }
    );
});

test('missing kid in header throws', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const header = { alg: 'RS256', typ: 'JWT' }; // no kid
    const token = createJwt(keyPair.privateKey, header, makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'JWT header missing kid');
            return true;
        }
    );
});

test('key not found in JWKS throws', async () => {
    ensureKeyPair();
    const jwksBody = { keys: [{ kid: 'different-kid', kty: publicKeyJwk.kty, n: publicKeyJwk.n, e: publicKeyJwk.e, alg: 'RS256', use: 'sig' }] };
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader('RS256', 'nonexistent-kid'), makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.ok(err.message.includes('Key not found in JWKS'));
            assert.ok(err.message.includes('nonexistent-kid'));
            return true;
        }
    );
});

test('unsupported algorithm (HS256) throws', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const header = { alg: 'HS256', kid: 'test-kid-1', typ: 'JWT' };
    const token = createJwt(keyPair.privateKey, header, makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Unsupported algorithm: HS256');
            return true;
        }
    );
});

test('invalid signature throws', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    // Create a valid JWT then tamper with the signature
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    const parts = token.split('.');
    const tampered = parts[0] + '.' + parts[1] + '.' + parts[2] + 'A';

    await assert.rejects(
        () => verifier.verifyAccessToken(tampered),
        (err) => {
            assert.equal(err.message, 'Invalid JWT signature');
            return true;
        }
    );
});

test('expired token throws', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ exp: now - 100 }));

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Token expired');
            return true;
        }
    );
});

test('token issued in future throws', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iat: now + 10000, exp: now + 20000 }));

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Token issued in the future');
            return true;
        }
    );
});

test('invalid issuer throws', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://expected-issuer.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iss: 'https://wrong-issuer.com' }));

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.ok(err.message.includes('Invalid issuer'));
            assert.ok(err.message.includes('expected-issuer.com'));
            assert.ok(err.message.includes('wrong-issuer.com'));
            return true;
        }
    );
});

test('invalid audience throws', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ aud: 'wrong-aud' }));

    // expectedAudience is passed to verifyAccessToken, not at creation time
    await assert.rejects(
        () => verifier.verifyAccessToken(token, 'expected-aud'),
        (err) => {
            assert.equal(err.message, 'Invalid audience: expected expected-aud');
            return true;
        }
    );
});

test('JWKS fetch failure (500) throws', async () => {
    ensureKeyPair();
    const logger = createMockLogger();

    const mockFetch = async (url) => ({
        ok: false,
        status: 500,
        json: async () => ({})
    });

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.ok(err.message.includes('Failed to fetch JWKS'));
            assert.ok(err.message.includes('500'));
            return true;
        }
    );
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('HTTP issuer triggers logger.warn', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    factory({ issuer: 'http://insecure.example.com' });

    assert.ok(logger.warns.length > 0, 'should log warning for HTTP issuer');
    assert.ok(logger.warns[0].includes('insecure'));
});

test('JWKS cache expired — re-fetch happens', async () => {
    ensureKeyPair();
    const jwksBodyV1 = createJwksResponse('kid-v1');
    const jwksBodyV2 = createJwksResponse('kid-v2');
    const logger = createMockLogger();

    // TODO: import JWKS_CACHE_TTL_MS from oidc-verifier.js if module exports it
    // NOTE: JWKS_CACHE_TTL_MS must match the value in oidc-verifier.js (60 * 60 * 1000).
    const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    let fetchCount = 0;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return { ok: true, status: 200, json: async () => ({ jwks_uri: 'https://idp.example.com/.well-known/jwks.json' }) };
        }
        fetchCount++;
        const body = fetchCount === 1 ? jwksBodyV1 : jwksBodyV2;
        return { ok: true, status: 200, json: async () => body };
    };

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });

        // First call: kid-v1 — jwks is null, getJwks fetches v1
        const now1 = Math.floor(currentTime / 1000);
        const tokenV1 = createJwt(keyPair.privateKey, makeHeader('RS256', 'kid-v1'), makePayload({ exp: now1 + 86400, iat: now1 }));
        await verifier.verifyAccessToken(tokenV1);
        assert.equal(fetchCount, 1, 'should fetch JWKS initially');

        // Advance time past cache TTL
        currentTime += JWKS_CACHE_TTL_MS + 1;

        // Second call: kid-v2 — not in cached v1 JWKS → getJwks → cache expired → re-fetch v2
        const now2 = Math.floor(currentTime / 1000);
        const tokenV2 = createJwt(keyPair.privateKey, makeHeader('RS256', 'kid-v2'), makePayload({ exp: now2 + 86400, iat: now2 }));
        await verifier.verifyAccessToken(tokenV2);
        assert.equal(fetchCount, 2, 'should re-fetch JWKS after cache expiry');
    } finally {
        dateMock.mock.restore();
    }
});

test('JWKS cache: kid not found after re-fetch throws', async () => {
    ensureKeyPair();
    const logger = createMockLogger();

    const jwksBody = { keys: [] }; // empty JWKS, kid will never be found
    const { fetch: mockFetch } = createMockFetch(jwksBody);

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader('RS256', 'never-found'), makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.ok(err.message.includes('Key not found in JWKS'));
            return true;
        }
    );
});

test('audience as array works', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com', audience: 'aud-b' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ aud: ['aud-a', 'aud-b'] }));
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
});

test('audience as string works', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com', audience: 'single-aud' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ aud: 'single-aud' }));
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
});

test('token without exp does not throw', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ exp: undefined, iat: now }));
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
});

test('token without iat does not throw', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iat: undefined, exp: now + 3600 }));
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
});

test('issuer trailing slash is normalized — iss comparison succeeds (review fix 3)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com/' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iss: 'https://idp.example.com' }));

    // issuer с трейлинг-слэшем нормализуется — токен с iss без слэша проходит.
    const result = await verifier.verifyAccessToken(token);
    assert.ok(result.claims);
});

test('issuer without trailing slash matches token issuer exactly', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iss: 'https://idp.example.com' }));
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
});

test('algorithm mismatch — JWT signed with RS384 but header claims RS256 → invalid signature', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    // Build a JWT where header says RS256 but we sign with RS384
    const headerB64 = base64UrlEncode(makeHeader('RS256'));
    const payloadB64 = base64UrlEncode(makePayload());
    const signingInput = `${headerB64}.${payloadB64}`;
    const privateKey = crypto.createPrivateKey({ key: keyPair.privateKey, format: 'jwk' });
    const sig = crypto.sign('sha384', Buffer.from(signingInput), privateKey); // RS384 signature
    const sigB64 = sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const mismatchedToken = `${headerB64}.${payloadB64}.${sigB64}`;

    await assert.rejects(
        () => verifier.verifyAccessToken(mismatchedToken),
        (err) => {
            assert.equal(err.message, 'Invalid JWT signature');
            return true;
        }
    );
});

test('multiple keys in JWKS — correct kid is matched', async () => {
    ensureKeyPair();
    const otherKeyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
        publicKeyEncoding: { type: 'spki', format: 'jwk' }
    });

    const jwksBody = {
        keys: [
            { kid: 'other-key', kty: otherKeyPair.publicKey.kty, n: otherKeyPair.publicKey.n, e: otherKeyPair.publicKey.e, alg: 'RS256', use: 'sig' },
            { kid: 'test-kid-1', kty: publicKeyJwk.kty, n: publicKeyJwk.n, e: publicKeyJwk.e, alg: 'RS256', use: 'sig' }
        ]
    };
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader('RS256', 'test-kid-1'), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims, 'should verify with correct key from multi-key JWKS');
    assert.equal(result.claims.sub, 'user-123');
});

// ---------------------------------------------------------------------------
// Dependency injection
// ---------------------------------------------------------------------------

test('options.fetchFn is used for JWKS endpoint', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    let requestedUrl = null;
    const mockFetch = async (url) => {
        requestedUrl = url;
        return { ok: true, status: 200, json: async () => jwksBody };
    };
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    await verifier.verifyAccessToken(token);

    assert.ok(requestedUrl, 'fetchFn should be called');
    assert.ok(requestedUrl.includes('/.well-known/jwks.json'), 'should fetch JWKS endpoint');
});

test('options.logger is used for warnings', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    factory({ issuer: 'http://insecure.example.com' });

    assert.ok(logger.warns.length > 0, 'logger.warn should be called');
});

test('default logger (console) is used when options.logger is omitted', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);

    // Should not throw — console is used as default
    const factory = createOidcVerifierFactory({ fetchFn: mockFetch });
    factory({ issuer: 'http://insecure.example.com' });
});

test('default fetchFn (globalThis.fetch) is used when options.fetchFn is omitted', async () => {
    ensureKeyPair();
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    const jwksBody = createJwksResponse();

    globalThis.fetch = async (url) => {
        fetchCalled = true;
        return { ok: true, status: 200, json: async () => jwksBody };
    };

    try {
        const factory = createOidcVerifierFactory();
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
        await verifier.verifyAccessToken(token);

        assert.ok(fetchCalled, 'globalThis.fetch should be used as fallback');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

// ---------------------------------------------------------------------------
// OIDC discovery (ADR-0038 review fix 1: вариант B)
// ---------------------------------------------------------------------------

test('OIDC discovery — jwks_uri from openid-configuration is used (Okta-style path)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksAtCustomPath = createJwksResponse('okta-kid');
    const jwksAtWellKnown = {
        keys: [{ kid: 'well-known-kid', kty: publicKeyJwk.kty, n: publicKeyJwk.n, e: publicKeyJwk.e, alg: 'RS256', use: 'sig' }]
    };

    let wellKnownFetched = false;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' })
            };
        }
        if (u.includes('/oauth2/default/v1/keys')) {
            return { ok: true, status: 200, json: async () => jwksAtCustomPath };
        }
        wellKnownFetched = true;
        return { ok: true, status: 200, json: async () => jwksAtWellKnown };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader('RS256', 'okta-kid'), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims, 'should verify using key from jwks_uri discovered via OIDC metadata');
    assert.equal(wellKnownFetched, false, 'should not fall back to well-known when jwks_uri resolves');
});

test('OIDC discovery failure (404) falls back to /.well-known/jwks.json', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksBody = createJwksResponse();

    const { fetch: mockFetch, getDiscoveryCallCount, getJwksCallCount } = createMockFetch(jwksBody, 200, { discoveryStatus: 404 });

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
    assert.equal(getDiscoveryCallCount(), 1);
    assert.equal(getJwksCallCount(), 1);
    assert.ok(logger.warns.length > 0, 'should log discovery fallback warning');
});

test('OIDC discovery without jwks_uri falls back to /.well-known/jwks.json', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksBody = createJwksResponse();

    const { fetch: mockFetch, getDiscoveryCallCount, getJwksCallCount } = createMockFetch(
        jwksBody,
        200,
        { discoveryBody: { issuer: 'https://idp.example.com' } }
    );

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims);
    assert.equal(getDiscoveryCallCount(), 1);
    assert.equal(getJwksCallCount(), 1);
});

test('OIDC discovery — jwks_uri on foreign origin is ignored (SSRF guard)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksBody = createJwksResponse();

    let fetchedForeign = false;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://evil.example.com/keys' })
            };
        }
        if (u.includes('evil.example.com')) {
            fetchedForeign = true;
            return { ok: true, status: 200, json: async () => ({ keys: [] }) };
        }
        return { ok: true, status: 200, json: async () => jwksBody };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims, 'should fall back to well-known key when discovered jwks_uri is foreign');
    assert.equal(fetchedForeign, false, 'should never fetch jwks_uri from foreign origin');
    assert.ok(logger.warns.some((m) => m.includes('foreign origin')));
});

test('OIDC discovery — relative jwks_uri is resolved against issuer origin (review fix 3)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksAtRelativePath = createJwksResponse('rel-kid');

    let requestedUrl = null;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: '/oauth2/default/v1/keys' })
            };
        }
        requestedUrl = u;
        return { ok: true, status: 200, json: async () => jwksAtRelativePath };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader('RS256', 'rel-kid'), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims, 'should verify using key from relative jwks_uri');
    assert.equal(requestedUrl, 'https://idp.example.com/oauth2/default/v1/keys', 'relative jwks_uri should be resolved to absolute same-origin URL');
});

test('JWKS fetch failure on discovered jwks_uri falls back to /.well-known/jwks.json (review fix 1)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksAtWellKnown = createJwksResponse();

    let customFetched = 0;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' })
            };
        }
        if (u.includes('/oauth2/default/v1/keys')) {
            customFetched++;
            return { ok: false, status: 404, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => jwksAtWellKnown };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims, 'should verify via well-known fallback when discovered jwks_uri 404s');
    assert.equal(customFetched, 1);
    assert.ok(logger.warns.some((m) => m.includes('retrying')));
});

test('JWKS fetch failure on discovered jwks_uri with dead fallback still throws (review fix 1)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();

    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' })
            };
        }
        return { ok: false, status: 500, json: async () => ({}) };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.ok(err.message.includes('Failed to fetch JWKS'));
            return true;
        }
    );
});

test('failed OIDC discovery is negative-cached — re-resolved on next refresh (review fix 2)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
    const JWKS_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    let discoveryCount = 0;
    let jwksCount = 0;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            discoveryCount++;
            return { ok: false, status: 500, json: async () => ({}) };
        }
        jwksCount++;
        return { ok: true, status: 200, json: async () => createJwksResponse('kid-' + jwksCount) };
    };

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });

        const ts = () => Math.floor(currentTime / 1000);
        const tokenFor = (kid) => createJwt(keyPair.privateKey, makeHeader('RS256', kid), makePayload({ exp: ts() + 86400, iat: ts() }));

        // t0: discovery fails (500) → fallback jwks (kid-1)
        await verifier.verifyAccessToken(tokenFor('kid-1'));
        assert.equal(discoveryCount, 1);
        assert.equal(jwksCount, 1);

        // t0 + 5min + 1s: negative TTL прошёл, но jwks-кэш (1ч) ещё валиден —
        // с известным kid пере-верификация не требует re-discovery.
        currentTime += JWKS_NEGATIVE_CACHE_TTL_MS + 1;
        await verifier.verifyAccessToken(tokenFor('kid-1'));
        assert.equal(discoveryCount, 1, 'no re-discovery while jwks cache is valid');

        // t0 + 1ч + 5мин + 1с: jwks-кэш протух → getJwksUri → negative-кэш
        // discovery тоже протух → discovery пере-резолвится (не залипает на час).
        currentTime += JWKS_CACHE_TTL_MS;
        await verifier.verifyAccessToken(tokenFor('kid-2'));
        assert.equal(discoveryCount, 2, 'failed discovery should be re-resolved on next refresh');
        assert.equal(jwksCount, 2);
    } finally {
        dateMock.mock.restore();
    }
});

// ---------------------------------------------------------------------------
// Review round 2 (PR#25): key rotation, negative JWKS cache, audience default, issuer URL
// ---------------------------------------------------------------------------

test('key rotation inside JWKS cache window — kid-miss forces refresh (review fix 1)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();

    const jwksBodyV1 = { keys: [{ kid: 'old-kid', kty: publicKeyJwk.kty, n: publicKeyJwk.n, e: publicKeyJwk.e, alg: 'RS256', use: 'sig' }] };
    const jwksBodyV2 = createJwksResponse('new-kid');

    const { fetch: mockFetch, getJwksCallCount } = createRotatingJwksFetch([jwksBodyV1, jwksBodyV2]);

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const tokenV1 = createJwt(keyPair.privateKey, makeHeader('RS256', 'old-kid'), makePayload());
    const result1 = await verifier.verifyAccessToken(tokenV1);
    assert.ok(result1.claims);
    assert.equal(getJwksCallCount(), 1, 'should fetch JWKS on first call');

    // Ротация ключей ВНУТРИ 1h кеш-окна: kid-miss должен принудительно
    // обновить JWKS, а не отдавать кеш и резать токены на час.
    const tokenV2 = createJwt(keyPair.privateKey, makeHeader('RS256', 'new-kid'), makePayload());
    const result2 = await verifier.verifyAccessToken(tokenV2);
    assert.ok(result2.claims, 'rotated kid should verify via forced refresh inside cache window');
    assert.equal(getJwksCallCount(), 2, 'kid-miss should force a refresh bypassing the TTL guard');
});

test('failed JWKS fetch is negative-cached — no retry storm within 5 minutes (review fix 2)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const JWKS_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    let jwksFetchCount = 0;
    let failJwks = true;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return { ok: true, status: 200, json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' }) };
        }
        jwksFetchCount++;
        if (failJwks) {
            return { ok: false, status: 500, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => createJwksResponse('kid-live') };
    };

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const ts = () => Math.floor(currentTime / 1000);
        const tokenFor = (kid) => createJwt(keyPair.privateKey, makeHeader('RS256', kid), makePayload({ exp: ts() + 86400, iat: ts() }));

        // t0: IdP недоступен — первый запрос делает 2 fetch (jwks_uri + fallback),
        // оба падают → jwks остаётся null, фиксируется сбойный fetch.
        await assert.rejects(() => verifier.verifyAccessToken(tokenFor('kid-live')));
        assert.equal(jwksFetchCount, 2, 'first attempt: discovered jwks_uri + fallback retry');

        // Внутри negative TTL: повторные /ingest НЕ делают сетевых вызовов.
        currentTime += 1000;
        await assert.rejects(() => verifier.verifyAccessToken(tokenFor('kid-live')));
        assert.equal(jwksFetchCount, 2, 'negative cache — no retry storm within 5 minutes');

        // t0+5мин+1с: negative TTL прошёл → refresh повторяется (снова 2 fetch).
        currentTime += JWKS_NEGATIVE_CACHE_TTL_MS + 1;
        await assert.rejects(() => verifier.verifyAccessToken(tokenFor('kid-live')));
        assert.equal(jwksFetchCount, 4, 'after negative TTL the refresh is retried');

        // IdP ожил → следующий refresh успешен.
        failJwks = false;
        currentTime += JWKS_NEGATIVE_CACHE_TTL_MS + 1;
        const result = await verifier.verifyAccessToken(tokenFor('kid-live'));
        assert.ok(result.claims);
        assert.equal(jwksFetchCount, 5);
    } finally {
        dateMock.mock.restore();
    }
});

test('createVerifier audience is used as default when verifyAccessToken has no expectedAudience (review fix 3)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com', audience: 'created-aud' });

    // Токен с другим aud — должен быть отклонён даже без 2-го аргумента.
    const wrongAudToken = createJwt(keyPair.privateKey, makeHeader(), makePayload({ aud: 'other-aud' }));
    await assert.rejects(
        () => verifier.verifyAccessToken(wrongAudToken),
        (err) => {
            assert.ok(err.message.includes('Invalid audience'));
            assert.ok(err.message.includes('created-aud'));
            return true;
        }
    );

    // Токен с aud из createVerifier — проходит.
    const correctAudToken = createJwt(keyPair.privateKey, makeHeader(), makePayload({ aud: 'created-aud' }));
    const result = await verifier.verifyAccessToken(correctAudToken);
    assert.ok(result.claims);
});

test('createVerifier rejects non-URL issuer with a clear error (review nit)', () => {
    const logger = createMockLogger();
    const factory = createOidcVerifierFactory({ logger });

    assert.throws(
        () => factory({ issuer: 'idp.example.com' }),
        (err) => {
            assert.ok(err.message.includes('Invalid issuer URL'));
            assert.ok(err.message.includes('idp.example.com'));
            return true;
        }
    );
});

// ---------------------------------------------------------------------------
// Review round 3 (PR#25): fetch timeout, kid-miss negative window, alg-before-import
// ---------------------------------------------------------------------------

test('fetch is called with AbortSignal.timeout and redirect: manual (review fixes 1, 5)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    let capturedOptions = null;
    const mockFetch = async (url, options) => {
        capturedOptions = options;
        return { ok: true, status: 200, json: async () => jwksBody };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    await verifier.verifyAccessToken(token);

    assert.ok(capturedOptions, 'fetch should receive an options argument');
    assert.equal(capturedOptions.redirect, 'manual', 'redirects must not be followed (SSRF guard)');
    assert.ok(capturedOptions.signal instanceof AbortSignal, 'fetch should receive an AbortSignal');
    assert.equal(capturedOptions.signal.aborted, false);
});

test('kid-miss inside negative JWKS window does not hit the network (review fix 2)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    let totalFetchCount = 0;
    let failJwks = false;
    const mockFetch = async (url) => {
        const u = String(url);
        totalFetchCount++;
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' })
            };
        }
        if (failJwks) {
            return { ok: false, status: 500, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => createJwksResponse('kid-old') };
    };

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const ts = () => Math.floor(currentTime / 1000);
        const tokenFor = (kid) => createJwt(keyPair.privateKey, makeHeader('RS256', kid), makePayload({ exp: ts() + 86400, iat: ts() }));

        // t0: успешный fetch (kid-old в кеше).
        await verifier.verifyAccessToken(tokenFor('kid-old'));
        assert.equal(totalFetchCount, 2, 'first call: discovery + jwks');

        // t0+1ч: кеш протух, IdP упал → refresh падает (jwks_uri + fallback),
        // jwksFailedAt фиксируется, getJwks() отдаёт устаревший кеш.
        currentTime += JWKS_CACHE_TTL_MS + 1;
        failJwks = true;
        await assert.rejects(() => verifier.verifyAccessToken(tokenFor('kid-new')));
        assert.equal(totalFetchCount, 5, 'expired cache: re-discovery + 2 failed jwks fetches');

        // Внутри отрицательного окна: kid-miss НЕ дёргает сеть.
        currentTime += 1000;
        await assert.rejects(
            () => verifier.verifyAccessToken(tokenFor('kid-new')),
            (err) => {
                assert.ok(err.message.includes('Key not found in JWKS'));
                return true;
            }
        );
        assert.equal(totalFetchCount, 5, 'no network on kid-miss inside negative window');
    } finally {
        dateMock.mock.restore();
    }
});

test('unsupported algorithm is reported before key import (review fix 4)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    // kty: 'oct' (symmetric) — crypto.createPublicKey с таким JWK бросил бы
    // невнятную ошибку, если бы importKey выполнялся до allowlist-проверки.
    const jwksBody = {
        keys: [{ kid: 'hs-key', kty: 'oct', k: 'Zm9v', alg: 'HS256', use: 'sig' }]
    };
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const header = { alg: 'HS256', kid: 'hs-key', typ: 'JWT' };
    const token = createJwt(keyPair.privateKey, header, makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Unsupported algorithm: HS256');
            return true;
        }
    );
});
