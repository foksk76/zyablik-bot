// SPDX-License-Identifier: Apache-2.0
const test = require('node:test');
const { mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
    MODULE_NAME,
    JWKS_CACHE_TTL_MS,
    JWKS_NEGATIVE_CACHE_TTL_MS,
    JWKS_FORCED_REFRESH_MIN_INTERVAL_MS,
    DISCOVERY_NOT_FOUND_TTL_MS,
    createOidcVerifierFactory
} = require('../../src/bot-platform/ingress/oidc-verifier');

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

function createJwtFromParts(headerB64, payloadB64) {
    const signingInput = `${headerB64}.${payloadB64}`;
    const privateKey = crypto.createPrivateKey({ key: keyPair.privateKey, format: 'jwk' });
    const sig = crypto.sign('sha256', Buffer.from(signingInput), privateKey);
    const sigB64 = sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return `${signingInput}.${sigB64}`;
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

// ---------------------------------------------------------------------------
// Review round 5 (PR#25): iss normalization, clock skew, redirects, kid sanitize
// ---------------------------------------------------------------------------

test('token iss with trailing slash verifies against issuer without slash (review fix 1)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iss: 'https://idp.example.com/' }));

    const result = await verifier.verifyAccessToken(token);
    assert.ok(result.claims, 'token iss with trailing slash should verify');
});

test('iat within clock skew tolerance verifies (review fix 2)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iat: now + 5, exp: now + 3600 }));

    const result = await verifier.verifyAccessToken(token);
    assert.ok(result.claims, 'iat a few seconds in the future (clock skew) should verify');
});

test('nbf within clock skew tolerance verifies (review fix 2)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ nbf: now + 5, exp: now + 3600 }));

    const result = await verifier.verifyAccessToken(token);
    assert.ok(result.claims, 'nbf a few seconds in the future (clock skew) should verify');
});

test('clockSkewToleranceSec: 0 restores strict iat validation (review fix 2)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com', clockSkewToleranceSec: 0 });

    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iat: now + 5, exp: now + 3600 }));

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Token issued in the future');
            return true;
        }
    );
});

test('same-origin redirect on discovery is followed (review fix 3)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksBody = createJwksResponse();

    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: false,
                status: 302,
                headers: { get: (name) => (name === 'location' ? 'https://idp.example.com/.well-known/openid-configuration-real' : null) },
                json: async () => ({})
            };
        }
        if (u.includes('openid-configuration-real')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' })
            };
        }
        return { ok: true, status: 200, json: async () => jwksBody };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    const result = await verifier.verifyAccessToken(token);
    assert.ok(result.claims, 'same-origin redirect should be followed and verification should succeed');
});

test('redirect to foreign origin is refused and fallback is used (review fix 3)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksBody = createJwksResponse();

    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: false,
                status: 302,
                headers: { get: (name) => (name === 'location' ? 'http://192.168.10.5/internal/keys' : null) },
                json: async () => ({})
            };
        }
        return { ok: true, status: 200, json: async () => jwksBody };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims, 'should fall back to /.well-known/jwks.json after refusing foreign redirect');
    assert.ok(logger.warns.some((m) => m.includes('Refusing redirect to foreign origin')));
    assert.ok(logger.warns.some((m) => m.includes('OIDC discovery returned 302')));
});

test('attacker-controlled kid is sanitized in error message (review fix 4)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const evilKid = 'kid\nSECRET';
    const token = createJwt(keyPair.privateKey, makeHeader('RS256', evilKid), makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Key not found in JWKS: kidSECRET');
            assert.ok(!err.message.includes('\n'), 'control chars must be stripped from kid');
            return true;
        }
    );
});

test('expired token is rejected before any network call (review nit)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch, getCallCount, getDiscoveryCallCount, getJwksCallCount } = createMockFetch(jwksBody);
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
    assert.equal(getCallCount(), 0, 'no discovery or JWKS fetch for an expired token');
    assert.equal(getDiscoveryCallCount(), 0);
    assert.equal(getJwksCallCount(), 0);
});

test('KeyObject is cached per kid across verifications (review nit)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());

    const originalCreatePublicKey = crypto.createPublicKey;
    let imports = 0;
    const importMock = mock.method(crypto, 'createPublicKey', (opts) => {
        imports++;
        return originalCreatePublicKey(opts);
    });

    try {
        await verifier.verifyAccessToken(token);
        await verifier.verifyAccessToken(token);
        assert.equal(imports, 1, 'public key should be imported once and cached per kid');
    } finally {
        importMock.mock.restore();
    }
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
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iat: now + 3600, exp: now + 3700 }));

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

test('JWKS body that is not JSON yields a stable error, not a raw JSON.parse preview (review round 8)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    let jwksFetched = 0;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return { ok: true, status: 200, json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' }) };
        }
        jwksFetched++;
        return {
            ok: true,
            status: 200,
            json: async () => { throw new SyntaxError('Unexpected token \u0000 in JSON at position 0'); }
        };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'JWKS body is not JSON');
            assert.ok(!err.message.includes('\u0000'), 'error must not embed raw input preview with control chars');
            return true;
        }
    );
    assert.equal(jwksFetched, 2, 'discovered jwks_uri + well-known fallback both attempted');
    assert.ok(logger.warns.some((m) => m.includes('JWKS body is not JSON')), 'retry-warning should carry the stable message');
});

test('SSRF-rejected jwks_uri is cached authoritatively — no 5-minute re-probe (review round 8)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
    const JWKS_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    let discoveryCount = 0;
    // Ротация ключей: kid появляется в well-known только к моменту своего
    // использования, поэтому каждый шаг форсирует kid-miss → refresh.
    const jwksBody = { keys: [createJwksResponse('kid-a').keys[0]] };
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            discoveryCount++;
            return { ok: true, status: 200, json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://evil.example.com/keys' }) };
        }
        return { ok: true, status: 200, json: async () => ({ keys: jwksBody.keys.slice() }) };
    };

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const ts = () => Math.floor(currentTime / 1000);
        const tokenFor = (kid) => createJwt(keyPair.privateKey, makeHeader('RS256', kid), makePayload({ exp: ts() + 86400, iat: ts() }));

        // t0: discovery выдал чужой jwks_uri → авторитетный fallback на well-known.
        const result = await verifier.verifyAccessToken(tokenFor('kid-a'));
        assert.ok(result.claims);
        assert.equal(discoveryCount, 1);

        // kid-miss (kid-b) форсирует refresh; внутри 15-мин авторитетного кеша
        // (DISCOVERY_NOT_FOUND_TTL_MS) discovery НЕ пере-пробуется, хотя для
        // неавторитетного отказа прошёл бы 5-мин TTL.
        jwksBody.keys.push(createJwksResponse('kid-b').keys[0]);
        currentTime += JWKS_NEGATIVE_CACHE_TTL_MS + 1;
        const result2 = await verifier.verifyAccessToken(tokenFor('kid-b'));
        assert.ok(result2.claims);
        assert.equal(discoveryCount, 1, 'foreign-origin jwks_uri must not re-probe discovery at the 5-minute mark');

        // kid-miss (kid-c) форсирует refresh; прошёл 15-мин авторитетный TTL
        // отказа (плюс 1h тестовое смещение) → discovery разрешается заново.
        jwksBody.keys.push(createJwksResponse('kid-c').keys[0]);
        currentTime += JWKS_CACHE_TTL_MS + 1;
        const result3 = await verifier.verifyAccessToken(tokenFor('kid-c'));
        assert.ok(result3.claims);
        assert.equal(discoveryCount, 2, 'after the authoritative notFound TTL the discovery is re-resolved');
    } finally {
        dateMock.mock.restore();
    }
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

test('key rotation inside JWKS cache window — kid-miss forces refresh after grace period (review fix 1)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const JWKS_FORCED_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    const jwksBodyV1 = { keys: [{ kid: 'old-kid', kty: publicKeyJwk.kty, n: publicKeyJwk.n, e: publicKeyJwk.e, alg: 'RS256', use: 'sig' }] };
    const jwksBodyV2 = createJwksResponse('new-kid');

    const { fetch: mockFetch, getJwksCallCount } = createRotatingJwksFetch([jwksBodyV1, jwksBodyV2]);

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const ts = () => Math.floor(currentTime / 1000);
        const tokenFor = (kid) => createJwt(keyPair.privateKey, makeHeader('RS256', kid), makePayload({ exp: ts() + 86400, iat: ts() }));

        // t0: ключ old-kid загружен.
        const result1 = await verifier.verifyAccessToken(tokenFor('old-kid'));
        assert.ok(result1.claims);
        assert.equal(getJwksCallCount(), 1, 'should fetch JWKS on first call');

        // Сразу после fetch refresh не форсится (grace-период) — нет сети,
        // ротация не видна до истечения grace.
        currentTime += 1000;
        await assert.rejects(() => verifier.verifyAccessToken(tokenFor('new-kid')));
        assert.equal(getJwksCallCount(), 1, 'no forced refresh within grace period');

        // Ротация после grace-периода: kid-miss форсит refresh внутри 1h кеш-окна.
        currentTime += JWKS_FORCED_REFRESH_MIN_INTERVAL_MS;
        const result2 = await verifier.verifyAccessToken(tokenFor('new-kid'));
        assert.ok(result2.claims, 'rotated kid should verify via forced refresh');
        assert.equal(getJwksCallCount(), 2, 'kid-miss should force a refresh after the grace period');
    } finally {
        dateMock.mock.restore();
    }
});

test('unknown kid after cache expiry triggers a single refresh, not two (review fix 1)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    // Оба ответа содержат только old-kid — new-kid не найдётся даже после refresh.
    const jwksBody = { keys: [{ kid: 'old-kid', kty: publicKeyJwk.kty, n: publicKeyJwk.n, e: publicKeyJwk.e, alg: 'RS256', use: 'sig' }] };
    const { fetch: mockFetch, getJwksCallCount } = createRotatingJwksFetch([jwksBody, jwksBody]);

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const ts = () => Math.floor(currentTime / 1000);
        const tokenFor = (kid) => createJwt(keyPair.privateKey, makeHeader('RS256', kid), makePayload({ exp: ts() + 86400, iat: ts() }));

        await verifier.verifyAccessToken(tokenFor('old-kid'));
        assert.equal(getJwksCallCount(), 1);

        // 1h-кеш протух: getJwks() обновляет JWKS, но kid не найден —
        // grace-период не даёт findKeyForKid сделать ВТОРОЙ refresh.
        currentTime += JWKS_CACHE_TTL_MS + 1;
        await assert.rejects(() => verifier.verifyAccessToken(tokenFor('new-kid')));
        assert.equal(getJwksCallCount(), 2, 'single refresh on cache expiry — no double refresh');
    } finally {
        dateMock.mock.restore();
    }
});

test('reused kid after rotation + cache expiry forces refresh — stale key not used (review round 10)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    // Вторая пара RSA-ключей: IdP «ротирует» ключ, ПЕРЕИСПОЛЬЗУЯ kid
    // (RFC 7517 — kid это hint, а не гарантия уникальности). Первый
    // short-circuit в findKeyForKid обязан учитывать TTL кеша — иначе
    // старый ключ под тем же kid матчился бы вечно и refresh не
    // форсировался бы никогда (обход ротационной механики).
    const rotatedKeyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
        publicKeyEncoding: { type: 'spki', format: 'jwk' }
    });
    const jwksV1 = { keys: [createJwksResponse('reused-kid').keys[0]] };
    const jwksV2 = { keys: [createJwksResponse('reused-kid', rotatedKeyPair.publicKey).keys[0]] };
    const { fetch: mockFetch, getJwksCallCount } = createRotatingJwksFetch([jwksV1, jwksV2]);

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const ts = () => Math.floor(currentTime / 1000);
        const payload = () => makePayload({ exp: ts() + 86400, iat: ts() });

        // t0: старый ключ A под kid 'reused-kid' загружен и верифицирует.
        const tokenA = createJwt(keyPair.privateKey, makeHeader('RS256', 'reused-kid'), payload());
        const result1 = await verifier.verifyAccessToken(tokenA);
        assert.ok(result1.claims);
        assert.equal(getJwksCallCount(), 1);

        // Прошёл 1h-кеш; IdP сменил ключ на B, сохранив kid.
        currentTime += JWKS_CACHE_TTL_MS + 1;

        // Токен подписан новым ключом B: протухший кеш со старым ключом A под
        // тем же kid не должен использоваться — по истечении TTL первый
        // short-circuit не срабатывает, findKeyForKid обновляет JWKS.
        const tokenB = createJwt(rotatedKeyPair.privateKey, makeHeader('RS256', 'reused-kid'), payload());
        const result2 = await verifier.verifyAccessToken(tokenB);
        assert.ok(result2.claims, 'rotated key under the same kid must verify after cache expiry');
        assert.equal(getJwksCallCount(), 2, 'stale JWKS cache must be refreshed before reusing a known kid');
    } finally {
        dateMock.mock.restore();
    }
});

test('200-without-keys JWKS is treated as failure and negative-cached (review fix 2)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();

    let jwksFetchCount = 0;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' })
            };
        }
        jwksFetchCount++;
        return { ok: true, status: 200, json: async () => ({}) }; // keysless
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());

    // Первый вызов: fetch по discovered jwks_uri + retry fallback, оба keysless → fail.
    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.ok(err.message.includes('JWKS has no keys array') || err.message.includes('JWKS unavailable'));
            return true;
        }
    );
    assert.equal(jwksFetchCount, 2, 'discovered jwks_uri + fallback retry');

    // Внутри отрицательного окна: повторные /ingest без сети.
    await assert.rejects(() => verifier.verifyAccessToken(token));
    assert.equal(jwksFetchCount, 2, 'keysless response is negative-cached — no per-request refresh');
});

test('token with nbf in the future is rejected (review fix 3)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ nbf: now + 3600, exp: now + 3700 }));

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Token not yet valid');
            return true;
        }
    );
});

test('OIDC discovery iss mismatch falls back to well-known keys (review fix 4)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksBody = createJwksResponse();

    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://other-issuer.example.com', jwks_uri: 'https://other-issuer.example.com/keys' })
            };
        }
        return { ok: true, status: 200, json: async () => jwksBody };
    };

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    const result = await verifier.verifyAccessToken(token);

    assert.ok(result.claims, 'should verify via well-known fallback when discovery issuer mismatches');
    assert.ok(logger.warns.some((m) => m.includes('issuer mismatch')));
});

test('non-RSA key type is rejected with a clean error (review minor)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const ecPair = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        privateKeyEncoding: { type: 'pkcs8', format: 'jwk' },
        publicKeyEncoding: { type: 'spki', format: 'jwk' }
    });

    const jwksBody = {
        keys: [{
            kid: 'ec-key',
            kty: 'EC',
            crv: ecPair.publicKey.crv,
            x: ecPair.publicKey.x,
            y: ecPair.publicKey.y,
            alg: 'ES256',
            use: 'sig'
        }]
    };
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    // RSA-подписанный токен с RS256, но ключ в JWKS — EC.
    const token = createJwt(keyPair.privateKey, makeHeader('RS256', 'ec-key'), makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Unsupported key type: EC');
            return true;
        }
    );
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

// ---------------------------------------------------------------------------
// Review round 6 (PR#25): alg before network, total fetch deadline, sanitize
// ---------------------------------------------------------------------------

test('unsupported algorithm is rejected before any network fetch (review fix 1)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch, getCallCount } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    // Неизвестный kid + неподдерживаемый alg: раньше проверка alg шла после
    // findKeyForKid, и такой токен на холодном старте дёргал discovery + JWKS.
    const token = createJwt(keyPair.privateKey, makeHeader('HS256', 'unknown-kid'), makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Unsupported algorithm: HS256');
            return true;
        }
    );
    assert.equal(getCallCount(), 0, 'alg allowlist must be checked before any network fetch');
});

test('attacker-controlled alg is sanitized in error message (review fix 4)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const evilAlg = 'HS256\nINJECT';
    const token = createJwt(keyPair.privateKey, makeHeader(evilAlg, 'test-kid-1'), makePayload());

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.ok(err.message.startsWith('Unsupported algorithm: '));
            assert.ok(!err.message.includes('\n'), 'control chars must be stripped from alg');
            return true;
        }
    );
});

test('attacker-controlled iss is sanitized in error message (review fix 4)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const evilIss = 'https://other.example.com\nINJECT';
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iss: evilIss }));

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.ok(err.message.startsWith('Invalid issuer: expected'));
            assert.ok(!err.message.includes('\n'), 'control chars must be stripped from iss');
            return true;
        }
    );
});

test('total fetch deadline bounds the whole redirect chain (review fix 6)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    const jwksBody = createJwksResponse();
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);
    let fetchCount = 0;

    const mockFetch = async (url) => {
        fetchCount++;
        const u = String(url);
        // Discovery падает сразу (404, без редиректов) → дефолтный путь.
        // Редирект-петля живёт только на JWKS-эндпоинте — это одна цепочка.
        if (u.includes('/.well-known/openid-configuration')) {
            return { ok: false, status: 404, json: async () => ({}) };
        }
        // Каждый fetch «съедает» 40 мс из общего бюджета (100 мс): петля
        // должна оборваться на 3-м JWKS-hop'е, а не дойти до лимита 5.
        currentTime += 40;
        return {
            ok: false,
            status: 302,
            headers: { get: (name) => (name === 'location' ? `https://idp.example.com/.well-known/jwks.json?hop=${fetchCount}` : null) },
            json: async () => ({})
        };
    };

    try {
        const factory = createOidcVerifierFactory({
            fetchFn: mockFetch,
            logger,
            fetchTimeoutMs: 5000,
            fetchTotalTimeoutMs: 100
        });
        const verifier = factory({ issuer: 'https://idp.example.com' });

        const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());

        await assert.rejects(
            () => verifier.verifyAccessToken(token),
            (err) => {
                assert.ok(err.message.includes('fetch timed out'), `expected total-deadline error, got: ${err.message}`);
                return true;
            }
        );
        // 1 discovery (404) + 3 JWKS-хопа: общий дедлайн обрывает цепочку
        // раньше, чем исчерпаются MAX_REDIRECT_HOPS (было бы 1 + 6).
        assert.equal(fetchCount, 4, 'total deadline must abort the redirect chain when the budget is exhausted');
        assert.ok(fetchCount < 6, 'redirect chain must never reach the 5-hop limit when the total budget is smaller');
    } finally {
        dateMock.mock.restore();
    }
});

// ---------------------------------------------------------------------------
// Round 7 review: iss/aud after signature check, exp skew, discovery dedup
// ---------------------------------------------------------------------------

test('invalid signature wins over mismatched aud — no config oracle (review fix 1)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ aud: 'wrong-aud' }));
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}A`;

    // Если бы aud проверялся до crypto.verify, атакующий с мусорной подписью
    // и подменённым aud получал бы 'Invalid audience' и по логу (reason)
    // угадывал expected aud. Сейчас победителем всегда является проверка
    // подписи.
    await assert.rejects(
        () => verifier.verifyAccessToken(tampered, 'expected-aud'),
        (err) => {
            assert.equal(err.message, 'Invalid JWT signature');
            return true;
        }
    );
});

test('invalid signature wins over mismatched iss — no config oracle (review fix 1)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iss: 'https://wrong-issuer.com' }));
    const parts = token.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}A`;

    await assert.rejects(
        () => verifier.verifyAccessToken(tampered),
        (err) => {
            assert.equal(err.message, 'Invalid JWT signature');
            return true;
        }
    );
});

test('exp within clock skew tolerance still verifies (review fix 2)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);
    // Часы IdP чуть впереди ingress: exp на 5 секунд в прошлом, допуск 30 с.
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ exp: now - 5 }));

    const result = await verifier.verifyAccessToken(token);
    assert.ok(result.claims, 'exp a few seconds in the past (clock skew) should verify');
});

test('exp beyond clock skew tolerance still rejects (review fix 2)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);
    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload({ exp: now - 60 }));

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Token expired');
            return true;
        }
    );
});

test('concurrent cold-start verifications share a single discovery (review fix 4)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch, getDiscoveryCallCount, getJwksCallCount } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = createJwt(keyPair.privateKey, makeHeader(), makePayload());

    // На холодном старте три параллельных запроса на один и тот же verifier:
    // discovery должен выполниться один раз, а не трижды.
    const results = await Promise.all([
        verifier.verifyAccessToken(token),
        verifier.verifyAccessToken(token),
        verifier.verifyAccessToken(token)
    ]);

    assert.equal(results.length, 3);
    assert.equal(getDiscoveryCallCount(), 1, 'concurrent cold-start verifications must share one discovery fetch');
    assert.equal(getJwksCallCount(), 1, 'concurrent cold-start verifications must share one JWKS fetch');
});

// ---------------------------------------------------------------------------
// Review round 8 (PR#25): discovery 404 authoritative cache, sanitized JSON errors
// ---------------------------------------------------------------------------

test('discovery 404 is cached as authoritative — no 5-min re-probe (review fix 3)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    let discoveryCount = 0;
    let jwksCount = 0;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            discoveryCount++;
            return { ok: false, status: 404, json: async () => ({}) };
        }
        jwksCount++;
        return { ok: true, status: 200, json: async () => createJwksResponse('kid-' + jwksCount) };
    };

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const ts = () => Math.floor(currentTime / 1000);
        const tokenFor = (kid) => createJwt(keyPair.privateKey, makeHeader('RS256', kid), makePayload({ exp: ts() + 86400, iat: ts() }));

        // t0: discovery 404 → fallback jwks.json (NanoIDP-сценарий).
        await verifier.verifyAccessToken(tokenFor('kid-1'));
        assert.equal(discoveryCount, 1);
        assert.equal(jwksCount, 1);

        // t0 + 5min + 1s: 5-мин отрицательный TTL прошёл, но 404 авторитетный —
        // кешируется на DISCOVERY_NOT_FOUND_TTL_MS (15 мин), пере-пробинга нет.
        currentTime += JWKS_NEGATIVE_CACHE_TTL_MS + 1;
        await verifier.verifyAccessToken(tokenFor('kid-1'));
        assert.equal(discoveryCount, 1, 'authoritative 404 must not be re-probed within the 5-min window');

        // t0 + 15 мин − 2с: внутри авторитетного окна (DISCOVERY_NOT_FOUND_TTL_MS)
        // всё ещё нет re-probe.
        currentTime += DISCOVERY_NOT_FOUND_TTL_MS - JWKS_NEGATIVE_CACHE_TTL_MS - 2000;
        await verifier.verifyAccessToken(tokenFor('kid-1'));
        assert.equal(discoveryCount, 1, 'authoritative 404 must not be re-probed within the 15-min window');

        // t0 + 20 мин: авторитетный TTL (15 мин) протух → 404 пере-резолвится.
        // Инвариант: re-probe срабатывает через kid-miss ('kid-2' нет в 1h-свежем
        // закешированном JWKS) + forced refresh — без 'kid-2' re-probe не
        // сработал бы вовсе, и discoveryCount-ассерт упал бы, не проверив путь.
        currentTime += JWKS_NEGATIVE_CACHE_TTL_MS + 1000;
        await verifier.verifyAccessToken(tokenFor('kid-2'));
        assert.equal(discoveryCount, 2, 'authoritative 404 is re-probed after the notFound TTL expiry');
        assert.equal(jwksCount, 2);
    } finally {
        dateMock.mock.restore();
    }
});

test('malformed header JSON throws sanitized error without input preview (review fix 4)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    // Header с control char: raw SyntaxError от JSON.parse вшивал бы превью
    // ввода (включая \0) в сообщение. Ожидаем стабильное 'Invalid JWT header'.
    const badHeader = '{"alg":"RS256\0evil"';
    const token = `${base64UrlEncode(badHeader)}.${base64UrlEncode(makePayload())}.${base64UrlEncode('signature')}`;

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Invalid JWT header');
            assert.ok(!err.message.includes('\0'), 'no raw input preview in error message');
            return true;
        }
    );
});

test('malformed payload JSON throws sanitized error (review fix 4)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const token = `${base64UrlEncode(makeHeader())}.${base64UrlEncode('{"sub":"x\0evil"')}.${base64UrlEncode('signature')}`;

    await assert.rejects(
        () => verifier.verifyAccessToken(token),
        (err) => {
            assert.equal(err.message, 'Invalid JWT payload');
            assert.ok(!err.message.includes('\0'), 'no raw input preview in error message');
            return true;
        }
    );
});

test('non-object header/payload yield stable errors, not raw TypeError (review round 9)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    // Header = JSON null: раньше header.kid кидал сырой TypeError в обход
    // stable-error контракта. Ожидаем 'Invalid JWT header'.
    const nullHeaderToken = createJwtFromParts(base64UrlEncode(null), base64UrlEncode(makePayload()));
    await assert.rejects(
        () => verifier.verifyAccessToken(nullHeaderToken),
        (err) => {
            assert.equal(err.message, 'Invalid JWT header');
            return true;
        }
    );

    // Payload = JSON null: раньше payload.exp кидал сырой TypeError.
    // Ожидаем 'Invalid JWT payload'.
    const nullPayloadToken = createJwtFromParts(base64UrlEncode(makeHeader()), base64UrlEncode(null));
    await assert.rejects(
        () => verifier.verifyAccessToken(nullPayloadToken),
        (err) => {
            assert.equal(err.message, 'Invalid JWT payload');
            return true;
        }
    );
});

// ---------------------------------------------------------------------------
// Review round 11 (PR#25): issuer query/fragment, numeric temporal claims,
// fallback-success keeps discovery authoritative
// ---------------------------------------------------------------------------

test('createVerifier rejects issuer with query or fragment (review round 11)', () => {
    const logger = createMockLogger();
    const factory = createOidcVerifierFactory({ logger });

    // Query в issuer: `issuerBaseUrl + DISCOVERY_PATH` дал бы битый URL, а
    // `payload.iss` из токена никогда не совпал бы с конфигом с query —
    // тихий 401 на все токены (тот же класс, что трейлинг-слэш).
    assert.throws(
        () => factory({ issuer: 'https://idp.example.com?tenant=prod' }),
        (err) => {
            assert.ok(err.message.includes('Invalid issuer URL'));
            assert.ok(err.message.includes('idp.example.com?tenant=prod'));
            return true;
        }
    );

    // Fragment в issuer: `issuerBaseUrl + DISCOVERY_PATH` с `#frag` срезает путь.
    assert.throws(
        () => factory({ issuer: 'https://idp.example.com#frag' }),
        (err) => {
            assert.ok(err.message.includes('Invalid issuer URL'));
            assert.ok(err.message.includes('idp.example.com#frag'));
            return true;
        }
    );

    // Трейлинг-слэш по-прежнему допустим (нормализуется).
    assert.doesNotThrow(() => factory({ issuer: 'https://idp.example.com/' }));

    // Percent-encoded `?`/`#` в пути — легитимные issuer (href сохраняет %3F/%23,
    // литеральных разделителей нет): ложных срабатываний href-проверки быть не должно.
    assert.doesNotThrow(() => factory({ issuer: 'https://idp.example.com/a%3Fb' }));
    assert.doesNotThrow(() => factory({ issuer: 'https://idp.example.com/a%23b' }));

    // Вырожденные холостые `?`/`#`: WHATWG-URL даёт пустые search/hash, но
    // сохраняет разделитель в href — иначе `issuerBaseUrl + DISCOVERY_PATH`
    // превращал путь в query/fragment и auth тихо ломался бы.
    assert.throws(
        () => factory({ issuer: 'https://idp.example.com?' }),
        (err) => {
            assert.ok(err.message.includes('Invalid issuer URL'));
            assert.ok(err.message.includes('idp.example.com?'));
            return true;
        }
    );
    assert.throws(
        () => factory({ issuer: 'https://idp.example.com#' }),
        (err) => {
            assert.ok(err.message.includes('Invalid issuer URL'));
            assert.ok(err.message.includes('idp.example.com#'));
            return true;
        }
    );
});

test('non-numeric temporal claims are rejected deterministically (review round 11)', async () => {
    ensureKeyPair();
    const jwksBody = createJwksResponse();
    const { fetch: mockFetch } = createMockFetch(jwksBody);
    const logger = createMockLogger();

    const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
    const verifier = factory({ issuer: 'https://idp.example.com' });

    const now = Math.floor(Date.now() / 1000);

    // exp как строка: раньше `"abc" < now` давал NaN → false → проверка молча
    // пропускалась, и токен проходил как «без exp». Теперь — детерминированный отказ.
    const stringExp = createJwt(keyPair.privateKey, makeHeader(), makePayload({ exp: String(now + 3600) }));
    await assert.rejects(
        () => verifier.verifyAccessToken(stringExp),
        (err) => {
            assert.equal(err.message, 'Invalid token exp claim');
            return true;
        }
    );

    // iat как строка.
    const stringIat = createJwt(keyPair.privateKey, makeHeader(), makePayload({ iat: String(now) }));
    await assert.rejects(
        () => verifier.verifyAccessToken(stringIat),
        (err) => {
            assert.equal(err.message, 'Invalid token iat claim');
            return true;
        }
    );

    // nbf как строка.
    const stringNbf = createJwt(keyPair.privateKey, makeHeader(), makePayload({ nbf: String(now) }));
    await assert.rejects(
        () => verifier.verifyAccessToken(stringNbf),
        (err) => {
            assert.equal(err.message, 'Invalid token nbf claim');
            return true;
        }
    );

    // exp = null — тоже non-number.
    const nullExp = createJwt(keyPair.privateKey, makeHeader(), makePayload({ exp: null }));
    await assert.rejects(
        () => verifier.verifyAccessToken(nullExp),
        (err) => {
            assert.equal(err.message, 'Invalid token exp claim');
            return true;
        }
    );

    // Sanity-check: корректный числовой токен по-прежнему проходит.
    const ok = createJwt(keyPair.privateKey, makeHeader(), makePayload());
    const result = await verifier.verifyAccessToken(ok);
    assert.ok(result.claims);
});

test('fallback success keeps discovery authoritative — no 5-min re-probe (review round 11)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    let discoveryCount = 0;
    let customJwksFetched = 0;
    let fallbackJwksCount = 0;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            discoveryCount++;
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' })
            };
        }
        if (u.includes('/oauth2/default/v1/keys')) {
            customJwksFetched++;
            return { ok: false, status: 500, json: async () => ({}) };
        }
        fallbackJwksCount++;
        return { ok: true, status: 200, json: async () => createJwksResponse('fb-kid-' + fallbackJwksCount) };
    };

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const ts = () => Math.floor(currentTime / 1000);
        const tokenFor = (kid) => createJwt(keyPair.privateKey, makeHeader('RS256', kid), makePayload({ exp: ts() + 86400, iat: ts() }));

        // t0: discovery валиден, но discovered jwks_uri 500-ит → fallback спасает.
        // jwksUriInfo должен остаться discovered:true (1h TTL), а не упасть в
        // 5-мин отрицательный кеш.
        const result1 = await verifier.verifyAccessToken(tokenFor('fb-kid-1'));
        assert.ok(result1.claims);
        assert.equal(discoveryCount, 1);
        assert.equal(customJwksFetched, 1);
        assert.equal(fallbackJwksCount, 1);

        // t0 + 5мин + 1с: kid-miss форсит refresh (grace прошёл) → getJwksUri
        // возвращает кешированный fallback с discovered:true — discovery НЕ
        // пере-пробуется на 5-мин отметке (с discovered:false был бы re-probe).
        currentTime += JWKS_NEGATIVE_CACHE_TTL_MS + 1000;
        const result2 = await verifier.verifyAccessToken(tokenFor('fb-kid-2'));
        assert.ok(result2.claims);
        assert.equal(discoveryCount, 1, 'healthy discovery must not be re-probed at the 5-minute mark');
        assert.equal(fallbackJwksCount, 2);

        // t0 + 1ч + 5мин + 1с: 1h-кеш jwksUriInfo протух → discovery пере-резолвится,
        // и восстановленный discovered jwks_uri снова будет испробован.
        currentTime += JWKS_CACHE_TTL_MS;
        const result3 = await verifier.verifyAccessToken(tokenFor('fb-kid-3'));
        assert.ok(result3.claims);
        assert.equal(discoveryCount, 2, 'discovery is re-resolved after the 1h jwksUriInfo TTL');
        assert.equal(customJwksFetched, 2, 'discovered jwks_uri is tried again after re-discovery');
        assert.equal(fallbackJwksCount, 3);
    } finally {
        dateMock.mock.restore();
    }
});

test('dead fallback is not self-retried and downgrades to short negative cache (review round 11 follow-up)', async () => {
    ensureKeyPair();
    const logger = createMockLogger();
    let currentTime = Date.now();
    const dateMock = mock.method(Date, 'now', () => currentTime);

    let discoveryCount = 0;
    let customJwksFetched = 0;
    let fallbackJwksFetched = 0;
    let fallbackBroken = false;
    let discoveredBroken = true;
    const mockFetch = async (url) => {
        const u = String(url);
        if (u.includes('/.well-known/openid-configuration')) {
            discoveryCount++;
            return {
                ok: true,
                status: 200,
                json: async () => ({ issuer: 'https://idp.example.com', jwks_uri: 'https://idp.example.com/oauth2/default/v1/keys' })
            };
        }
        if (u.includes('/oauth2/default/v1/keys')) {
            customJwksFetched++;
            if (discoveredBroken) {
                return { ok: false, status: 500, json: async () => ({}) };
            }
            return { ok: true, status: 200, json: async () => createJwksResponse('dk-1') };
        }
        fallbackJwksFetched++;
        if (fallbackBroken) {
            return { ok: false, status: 500, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => createJwksResponse('fb-kid-1') };
    };

    try {
        const factory = createOidcVerifierFactory({ fetchFn: mockFetch, logger });
        const verifier = factory({ issuer: 'https://idp.example.com' });
        const ts = () => Math.floor(currentTime / 1000);
        const tokenFor = (kid) => createJwt(keyPair.privateKey, makeHeader('RS256', kid), makePayload({ exp: ts() + 86400, iat: ts() }));

        // t0: discovered jwks_uri 500-ит, fallback спасает → jwksUriInfo
        // {fallbackUrl, discovered:true, resolvedAt:t0} (1h-кеш).
        const result1 = await verifier.verifyAccessToken(tokenFor('fb-kid-1'));
        assert.ok(result1.claims);
        assert.equal(discoveryCount, 1);
        assert.equal(customJwksFetched, 1);
        assert.equal(fallbackJwksFetched, 1);

        // t0 + 5мин + 1с: fallback тоже сломался. kid-miss форсит refresh →
        // fetchJwks(fallbackUrl) падает РОВНО ОДИН раз: self-retry тем же URL
        // отключён (иначе было бы два запроса), jwksUriInfo понижается до
        // discovered:false с новым resolvedAt.
        currentTime += JWKS_NEGATIVE_CACHE_TTL_MS + 1;
        fallbackBroken = true;
        await assert.rejects(
            () => verifier.verifyAccessToken(tokenFor('fb-kid-2')),
            /Key not found/
        );
        assert.equal(fallbackJwksFetched, 2, 'dead fallback is fetched once, not self-retried');

        // t0 + 5мин + 1с + 5мин + 1с: отрицательный TTL jwksUriInfo (5 мин) прошёл →
        // discovery пере-резолвится. Восстановившийся discovered jwks_uri теперь
        // отвечает — мёртвый fallback не должен пинниться до конца 1h-окна.
        currentTime += JWKS_NEGATIVE_CACHE_TTL_MS + 1;
        discoveredBroken = false;
        const result2 = await verifier.verifyAccessToken(tokenFor('dk-1'));
        assert.ok(result2.claims);
        assert.equal(discoveryCount, 2, 'discovery is re-resolved after the 5-min negative jwksUriInfo TTL');
        assert.equal(customJwksFetched, 2, 'recovered discovered jwks_uri is used instead of the dead fallback');
    } finally {
        dateMock.mock.restore();
    }
});
