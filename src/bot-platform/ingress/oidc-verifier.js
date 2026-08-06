// SPDX-License-Identifier: Apache-2.0
'use strict';

const crypto = require('node:crypto');

const MODULE_NAME = 'oidc-verifier';
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const JWKS_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_FORCED_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 15 * 1000;
const DEFAULT_CLOCK_SKEW_TOLERANCE_SEC = 30;
const MAX_REDIRECT_HOPS = 5;
const DISCOVERY_PATH = '/.well-known/openid-configuration';
const DEFAULT_JWKS_PATH = '/.well-known/jwks.json';

// kid приходит из заголовка токена (атакующий-контролируемый): в ошибки и логи
// попадает только санитизированная версия — без control chars и усечённая.
const SAFE_KID_MAX_LENGTH = 64;
function safeKid(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, SAFE_KID_MAX_LENGTH);
}

function createOidcVerifierFactory(options = {}) {
  const logger = options.logger || console;
  const fetchFn = options.fetchFn || globalThis.fetch;
  const fetchTimeoutMs = options.fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS;

  return function createVerifier({ issuer, audience, clockSkewToleranceSec }) {
    try {
      const parsedIssuer = new URL(issuer);
      if (parsedIssuer.protocol !== 'https:' && parsedIssuer.protocol !== 'http:') {
        throw new Error('unsupported scheme');
      }
    } catch {
      throw new Error(`Invalid issuer URL: ${issuer}`);
    }

    const normalizedIssuer = issuer.replace(/\/+$/, '');

    if (normalizedIssuer.startsWith('http://')) {
      logger.warn(`[${MODULE_NAME}] Using insecure HTTP issuer: ${normalizedIssuer}`);
    }

    const issuerBaseUrl = normalizedIssuer;
    const skewToleranceSec = typeof clockSkewToleranceSec === 'number'
      ? clockSkewToleranceSec
      : DEFAULT_CLOCK_SKEW_TOLERANCE_SEC;

    // Все исходящие fetch (discovery и JWKS) идут под AbortSignal.timeout —
    // зависший IdP (чёрная дыра без RST) не должен вешать весь ingress через
    // in-flight dedup. Редиректы (301/302/307/308) следуются, но только внутри
    // origin-а issuer'а (protocol + host), с проверкой каждого hop'а: SSRF-
    // редирект на внутренний/чужой адрес обрывается, а легитимная нормализация
    // URL реальных IdP (www→bare, http→https, трейлинг-слэш, issuer-path)
    // продолжает работать.
    async function fetchWithTimeout(url) {
      let currentUrl = url;
      for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
        const response = await fetchFn(currentUrl, {
          signal: AbortSignal.timeout(fetchTimeoutMs),
          redirect: 'manual'
        });
        if (response.status < 300 || response.status >= 400) {
          return response;
        }
        const location = response.headers && typeof response.headers.get === 'function'
          ? response.headers.get('location')
          : null;
        if (!location) {
          return response;
        }
        let target;
        try {
          target = new URL(location, currentUrl);
        } catch {
          return response;
        }
        if (target.protocol !== 'https:' && target.protocol !== 'http:') {
          return response;
        }
        const base = new URL(issuerBaseUrl);
        if (target.protocol !== base.protocol || target.host !== base.host) {
          logger.warn(`[${MODULE_NAME}] Refusing redirect to foreign origin: ${target.href}`);
          return response;
        }
        currentUrl = target.href;
      }
      throw new Error(`[${MODULE_NAME}] Too many redirects (max ${MAX_REDIRECT_HOPS}) for ${url}`);
    }

    let jwks = null;
    let jwksFetchedAt = 0;
    let jwksUriInfo = null;
    let jwksInFlight = null;
    let jwksFailedAt = 0;
    const keyObjectCache = new Map();

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
        response = await fetchWithTimeout(discoveryUrl);
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

      // OIDC spec (RFC 8414): поле `issuer` в discovery-документе должно
      // совпадать с запрошенным issuer. Mismatch говорит о баговом/враждебном
      // discovery — откатываемся на дефолтный путь от доверенного
      // (конфигурированного) issuer.
      const discoveryIssuer = typeof discovery?.issuer === 'string'
        ? discovery.issuer.replace(/\/+$/, '')
        : null;
      if (discoveryIssuer !== null && discoveryIssuer !== normalizedIssuer) {
        logger.warn(`[${MODULE_NAME}] OIDC discovery issuer mismatch for ${discoveryUrl}: expected ${normalizedIssuer}, got ${discovery.issuer}; using ${DEFAULT_JWKS_PATH}`);
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
      jwksUriInfo = { ...info, resolvedAt: Date.now() };
      return jwksUriInfo;
    }

    async function fetchJwks(url) {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch JWKS from ${url}: ${response.status}`);
      }
      return assertJwksShape(await response.json());
    }

    // 200-без-keys не должен кешироваться как успех на час (иначе findKey всегда
    // мимо → refresh на каждый запрос). Бросаем — сработает отрицательный кеш.
    function assertJwksShape(body) {
      if (!body || !Array.isArray(body.keys)) {
        throw new Error('JWKS has no keys array');
      }
      return body;
    }

    // Безусловная загрузка JWKS (минует TTL-кеш); дедупликация через общий
    // in-flight promise. При сбое протухшего/неверного jwks_uri из discovery —
    // один retry на дефолтный путь. Сбой фиксируется в jwksFailedAt.
    async function refreshJwks() {
      if (jwksInFlight) {
        return jwksInFlight;
      }
      jwksInFlight = (async () => {
        const { jwksUri, discovered } = await getJwksUri();

        try {
          const fresh = await fetchJwks(jwksUri);
          jwks = fresh;
          keyObjectCache.clear();
          jwksFetchedAt = Date.now();
          jwksFailedAt = 0;
          return fresh;
        } catch (err) {
          if (!discovered) {
            jwksFailedAt = Date.now();
            throw err;
          }
          // Протухший/неверный jwks_uri из discovery — один retry на дефолтный путь.
          const fallbackUrl = fallbackJwksUri();
          logger.warn(`[${MODULE_NAME}] JWKS fetch failed for ${jwksUri}: ${err.message}; retrying ${fallbackUrl}`);
          try {
            const fresh = await fetchJwks(fallbackUrl);
            jwks = fresh;
            keyObjectCache.clear();
            jwksFetchedAt = Date.now();
            jwksFailedAt = 0;
            jwksUriInfo = { jwksUri: fallbackUrl, discovered: false, resolvedAt: Date.now() };
            return fresh;
          } catch (fallbackErr) {
            jwksFailedAt = Date.now();
            throw fallbackErr;
          }
        }
      })();
      try {
        return await jwksInFlight;
      } finally {
        jwksInFlight = null;
      }
    }

    // Кешированный доступ: успешный fetch — 1 час; сбойный — короткий
    // отрицательный TTL (5 минут), в течение которого отдаётся последний
    // успешный кеш (или быстрая ошибка без сети), чтобы недоступный IdP
    // не умножал исходящие запросы на каждый /ingest.
    async function getJwks() {
      const now = Date.now();
      const recentlyFailed = jwksFailedAt !== 0 && (now - jwksFailedAt) < JWKS_NEGATIVE_CACHE_TTL_MS;

      if (recentlyFailed) {
        if (jwks) {
          return jwks;
        }
        throw new Error('JWKS unavailable (negative cache)');
      }

      if (jwks && (now - jwksFetchedAt) < JWKS_CACHE_TTL_MS) {
        return jwks;
      }

      try {
        return await refreshJwks();
      } catch (err) {
        if (jwks) {
          return jwks;
        }
        throw err;
      }
    }

    // Поиск ключа с поддержкой ротации: при kid-miss — cache-aware getJwks(),
    // затем принудительный refresh (ротация ключей внутри 1h кеш-окна),
    // с fallback на последний успешный кеш при сбое refresh. Refresh форсится
    // только вне отрицательного JWKS-окна (сбой) и вне grace-периода после
    // успешного fetch — иначе каждый kid-miss (легитимная ротация или случайные
    // kid от атакующего) стоил бы лишнего исходящего запроса, а после истечения
    // 1h-кеша один запрос делал бы двойной refresh (getJwks + принудительный).
    async function findKeyForKid(kid) {
      let keyJwk = findKey(kid);
      if (keyJwk) {
        return keyJwk;
      }

      await getJwks();
      keyJwk = findKey(kid);
      if (keyJwk) {
        return keyJwk;
      }

      const now = Date.now();
      const inNegativeWindow = jwksFailedAt !== 0
        && (now - jwksFailedAt) < JWKS_NEGATIVE_CACHE_TTL_MS;
      const recentlyFetched = jwksFetchedAt !== 0
        && (now - jwksFetchedAt) < JWKS_FORCED_REFRESH_MIN_INTERVAL_MS;
      if (!inNegativeWindow && !recentlyFetched) {
        try {
          await refreshJwks();
        } catch {
          // refresh упал — откатываемся к кешу: если kid там, верификация продолжится.
        }
      }

      keyJwk = findKey(kid);
      if (!keyJwk) {
        throw new Error(`Key not found in JWKS: ${safeKid(kid)}`);
      }
      return keyJwk;
    }

    function findKey(kid) {
      return jwks && jwks.keys && jwks.keys.find((k) => k.kid === kid);
    }

    function importKey(jwk, kid) {
      let key = keyObjectCache.get(kid);
      if (!key) {
        key = crypto.createPublicKey({
          key: jwk,
          format: 'jwk'
        });
        keyObjectCache.set(kid, key);
      }
      return key;
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

    // Claim-валидация выполняется ДО сетевых fetch и RSA-verify: claims лежат в
    // подписанной части токена, поэтому проверять их безопасно, а expired/
    // garbage-токен не должен на холодном старте дёргать discovery + JWKS
    // (амплификация через невалидные токены).
    function validateClaims(payload, expectedAudience, now) {
      if (payload.exp && payload.exp < now) {
        throw new Error('Token expired');
      }

      if (payload.iat && payload.iat > now + skewToleranceSec) {
        throw new Error('Token issued in the future');
      }

      if (payload.nbf && payload.nbf > now + skewToleranceSec) {
        throw new Error('Token not yet valid');
      }

      // payload.iss нормализуется так же, как конфигурированный issuer (срез
      // трейлинг-слэша), иначе токен с iss "https://idp/" при конфиге
      // "https://idp" давал бы тихий 401 на все токены.
      const tokenIssuer = typeof payload.iss === 'string'
        ? payload.iss.replace(/\/+$/, '')
        : payload.iss;
      if (normalizedIssuer && tokenIssuer !== normalizedIssuer) {
        throw new Error(`Invalid issuer: expected ${normalizedIssuer}, got ${payload.iss}`);
      }

      if (expectedAudience) {
        const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!aud.includes(expectedAudience)) {
          throw new Error(`Invalid audience: expected ${expectedAudience}`);
        }
      }
    }

    async function verifyAccessToken(token, expectedAudience = audience) {
      const { header, payload, signature, signingInput } = parseJwt(token);

      if (!header.kid) {
        throw new Error('JWT header missing kid');
      }

      validateClaims(payload, expectedAudience, Math.floor(Date.now() / 1000));

      const keyJwk = await findKeyForKid(header.kid);

      // Allowlist алгоритмов проверяется ДО importKey, чтобы EC-ключ или
      // мусорный header давали чистый Unsupported algorithm, а не невнятную
      // ошибку от crypto.createPublicKey.
      const algMap = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512' };
      const algorithm = algMap[header.alg];

      if (!algorithm) {
        throw new Error(`Unsupported algorithm: ${header.alg}`);
      }

      if (keyJwk.kty !== 'RSA') {
        throw new Error(`Unsupported key type: ${keyJwk.kty}`);
      }

      const key = importKey(keyJwk, header.kid);

      const valid = crypto.verify(
        algorithm,
        Buffer.from(signingInput),
        key,
        signature
      );

      if (!valid) {
        throw new Error('Invalid JWT signature');
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
