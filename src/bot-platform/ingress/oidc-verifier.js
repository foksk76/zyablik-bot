// SPDX-License-Identifier: Apache-2.0
'use strict';

const crypto = require('node:crypto');

const MODULE_NAME = 'oidc-verifier';
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;
const JWKS_NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_FORCED_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;
// Авторитетный 404 discovery («эндпоинта нет», SSRF-отказ jwks_uri) кешируется
// на 15 минут: 404 во время рестарта реального IdP неотличим от постоянного,
// и часовой кеш оставил бы auth сломанным до часа после восстановления IdP
// (fallback /.well-known/jwks.json тоже 404). Компромисс между отсутствием
// 5-минутного re-probe-шторма и часовым аутом.
const DISCOVERY_NOT_FOUND_TTL_MS = 15 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 15 * 1000;
const DEFAULT_FETCH_TOTAL_TIMEOUT_MS = 30 * 1000;
const DEFAULT_CLOCK_SKEW_TOLERANCE_SEC = 30;
const MAX_REDIRECT_HOPS = 5;
const DISCOVERY_PATH = '/.well-known/openid-configuration';
const DEFAULT_JWKS_PATH = '/.well-known/jwks.json';

// Значения из заголовка/полезной нагрузки токена (атакующий-контролируемые:
// kid, alg, iss) попадают в ошибки/логи только в санитизированном виде —
// без control chars и усечённые, иначе можно вшить перевод строки в лог.
const SAFE_VALUE_MAX_LENGTH = 64;
function safeValue(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, SAFE_VALUE_MAX_LENGTH);
}

function createOidcVerifierFactory(options = {}) {
  const logger = options.logger || console;
  const fetchFn = options.fetchFn || globalThis.fetch;
  const fetchTimeoutMs = options.fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS;
  const fetchTotalTimeoutMs = options.fetchTotalTimeoutMs || DEFAULT_FETCH_TOTAL_TIMEOUT_MS;

  return function createVerifier({ issuer, audience, clockSkewToleranceSec }) {
    try {
      const parsedIssuer = new URL(issuer);
      if (parsedIssuer.protocol !== 'https:' && parsedIssuer.protocol !== 'http:') {
        throw new Error('unsupported scheme');
      }
      // Query/fragment в issuer — тихий слом auth: `#frag` срезает путь при
      // сборке discovery-URL (`issuerBaseUrl + DISCOVERY_PATH`), а `?x=1`
      // делает невозможным совпадение с `payload.iss` токена. Отклоняем как
      // ошибку конфигурации (OIDC issuer — это origin с опциональным путём,
      // RFC 8414 не допускает query/fragment). Холостые `?`/`#` WHATWG-URL
      // нормализует в пустую строку и не считает их частью issuer.
      if (parsedIssuer.search || parsedIssuer.hash) {
        throw new Error('query or fragment not allowed');
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
    // origin-а issuer'а (точное равенство protocol + host) с проверкой каждого
    // hop'а: редирект на внутренний/чужой адрес, смену host (www→bare) или
    // смену протокола (http→https) обрываем (SSRF defense-in-depth; issuer
    // конфигурируется с финальным scheme/host — трейлинг-слэш и issuer-path
    // продолжают работать). Кроме per-hop timeout есть общий дедлайн на всю
    // цепочку (fetchTotalTimeoutMs, дефолт 30 с): иначе редирект-петля давала
    // бы до (MAX_REDIRECT_HOPS + 1) × fetchTimeoutMs ≈ 90 с, разделённых между
    // всеми /ingest через in-flight dedup. Каждый hop получает
    // min(fetchTimeoutMs, остаток общего бюджета).
    async function fetchWithTimeout(url) {
      const deadline = Date.now() + fetchTotalTimeoutMs;
      let currentUrl = url;
      for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) {
          throw new Error(`[${MODULE_NAME}] fetch timed out (total ${fetchTotalTimeoutMs}ms) for ${url}`);
        }
        const response = await fetchFn(currentUrl, {
          signal: AbortSignal.timeout(Math.min(fetchTimeoutMs, remainingMs)),
          redirect: 'manual'
        });
        if (response.status < 300) {
          return response;
        }
        if (response.status >= 400) {
          // Не-ok финальный ответ (404/500) никто не читает — caller бросает
          // по response.ok. Отменить тело сразу, иначе сокет не вернётся в пул.
          await response.body?.cancel();
          return response;
        }
        // 3xx-тело не читается (нужен только location): отменить поток, чтобы
        // не держать сокет unconsumed-ответом (гигиена undici).
        await response.body?.cancel();
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
    let jwksUriInFlight = null;
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
        // 404 — авторитетный ответ «эндпоинта нет» (целевой NanoIDP его
        // отдаёт всегда): кешируется на DISCOVERY_NOT_FOUND_TTL_MS (15 минут),
        // чтобы не пере-пробовать заведомо отсутствующий discovery каждые
        // 5 минут, но и не замораживать auth на час при транзиентном 404
        // (рестарт IdP). 5xx и сетевые сбои — транзиентные, для них остаётся
        // короткий отрицательный TTL.
        return { jwksUri: fallbackJwksUri(), discovered: false, notFound: response.status === 404 };
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
        // Авторитетный отказ: discovery-документ непригоден (чужой origin).
        // Кешировать как 404 — иначе кривой jwks_uri пере-пробовался бы
        // каждые 5 минут вечно.
        return { jwksUri: fallbackJwksUri(), discovered: false, notFound: true };
      }

      return { jwksUri: resolvedJwksUri, discovered: true };
    }

    // Кешируется успешный discovery (1 час) и авторитетный 404 (эндпоинта нет,
    // DISCOVERY_NOT_FOUND_TTL_MS); транзиентный сбой (5xx/сеть/таймаут) — на
    // короткий отрицательный TTL, чтобы недоступный IdP не застревал надолго.
    // Параллельные вызовы на холодном старте (burst /ingest) дедуплицируются
    // через общий in-flight promise — иначе каждый запускал бы свой discovery.
    async function getJwksUri() {
      const now = Date.now();
      if (jwksUriInfo) {
        const ttl = jwksUriInfo.discovered
          ? JWKS_CACHE_TTL_MS
          : jwksUriInfo.notFound
            ? DISCOVERY_NOT_FOUND_TTL_MS
            : JWKS_NEGATIVE_CACHE_TTL_MS;
        if (now - jwksUriInfo.resolvedAt < ttl) {
          return jwksUriInfo;
        }
      }

      if (jwksUriInFlight) {
        return jwksUriInFlight;
      }
      jwksUriInFlight = (async () => {
        const info = await resolveJwksUri();
        jwksUriInfo = { ...info, resolvedAt: Date.now() };
        return jwksUriInfo;
      })();
      try {
        return await jwksUriInFlight;
      } finally {
        jwksUriInFlight = null;
      }
    }

    async function fetchJwks(url) {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch JWKS from ${url}: ${response.status}`);
      }
      let body;
      try {
        body = await response.json();
      } catch {
        // Как и в parseJwt/discovery: raw SyntaxError от JSON.parse кидает
        // превью ввода с control chars — обернуть в стабильное сообщение.
        throw new Error('JWKS body is not JSON');
      }
      return assertJwksShape(body);
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
            // Discovery сам был валиден (сломался только jwks_uri): сохраняем
            // discovered:true, чтобы jwksUriInfo держал 1h-кеш (JWKS_CACHE_TTL_MS),
            // а не короткий 5-мин отрицательный — иначе рабочий discovery
            // пере-пробовался бы каждые 5 минут без причины. Fallback-URL
            // остаётся активным до истечения TTL, после чего discovery
            // пере-резолвится и восстановленный jwks_uri снова будет использован.
            jwksUriInfo = { jwksUri: fallbackUrl, discovered: true, resolvedAt: Date.now() };
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
      if (keyJwk && isJwksFresh()) {
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
        throw new Error(`Key not found in JWKS: ${safeValue(kid)}`);
      }
      return keyJwk;
    }

    function findKey(kid) {
      return jwks && jwks.keys && jwks.keys.find((k) => k.kid === kid);
    }

    // Кеш JWKS «свеж» внутри 1h TTL. Первый short-circuit в findKeyForKid
    // обязан учитывать TTL: если IdP переиспользует kid при ротации ключей
    // (RFC 7517 — kid это hint, а не гарантия уникальности), старый ключ под
    // тем же kid матчился бы вечно и refresh не форсировался бы никогда —
    // обход всей ротационной механики (grace/negative/kid-miss). После
    // истечения TTL даже известный kid проходит через getJwks() → refresh.
    function isJwksFresh() {
      return jwksFetchedAt !== 0 && (Date.now() - jwksFetchedAt) < JWKS_CACHE_TTL_MS;
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

      // JSON.parse на атакующий-контролируемом вводе кидает SyntaxError с
      // превью входных данных (включая control chars). Обернуть в стабильное
      // сообщение без встроенного ввода — иначе сырое превью текло бы в
      // ошибки/логи напрямую у консьюмеров модуля (см. safeValue).
      let header;
      let payload;
      try {
        header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
      } catch {
        throw new Error('Invalid JWT header');
      }
      try {
        payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
      } catch {
        throw new Error('Invalid JWT payload');
      }

      // JSON-литерал null (или примитив) парсится успешно, но не является
      // объектом: header.kid / payload.exp кидали бы сырой TypeError в обход
      // stable-error контракта (сообщение уходит в reason консьюмеров).
      if (typeof header !== 'object' || header === null) {
        throw new Error('Invalid JWT header');
      }
      if (typeof payload !== 'object' || payload === null) {
        throw new Error('Invalid JWT payload');
      }

      const signature = base64UrlDecode(parts[2]);

      return { header, payload, signature, signingInput: parts[0] + '.' + parts[1] };
    }

    // RFC 7519: NumericDate — это JSON-число (секунды с Unix epoch). Не-числовой
    // claim (например `exp: "abc"` или `iat: null`) в сравнении с `now` дал бы
    // NaN → сравнение всегда false → проверка молча пропускалась бы. Валидируем
    // тип детерминированно: любой non-number (строка, null, объект, NaN) —
    // стабильная ошибка `Invalid token {claim} claim`.
    function assertNumericDate(value, claim) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Invalid token ${claim} claim`);
      }
      return value;
    }

    // Temporal-claim-валидация (exp/iat/nbf) выполняется ДО сетевых fetch и
    // RSA-verify: значения приходят из самого токена и не раскрывают конфиг,
    // поэтому expired/garbage-токен не должен на холодном старте дёргать
    // discovery + JWKS (анти-амплификация). exp допускает skew в безопасную
    // сторону (токен, протухший в пределах clockSkewToleranceSec, ещё
    // принимается) — при расхождении часов IdP и ingress строгий exp резал бы
    // легитимные токены раньше времени. Claims опциональны (RFC 7519): токен
    // без exp/iat/nbf проходит, но присутствующий claim обязан быть числом.
    function validateTemporalClaims(payload, now) {
      if (payload.exp !== undefined) {
        const exp = assertNumericDate(payload.exp, 'exp');
        if (exp < now - skewToleranceSec) {
          throw new Error('Token expired');
        }
      }

      if (payload.iat !== undefined) {
        const iat = assertNumericDate(payload.iat, 'iat');
        if (iat > now + skewToleranceSec) {
          throw new Error('Token issued in the future');
        }
      }

      if (payload.nbf !== undefined) {
        const nbf = assertNumericDate(payload.nbf, 'nbf');
        if (nbf > now + skewToleranceSec) {
          throw new Error('Token not yet valid');
        }
      }
    }

    // iss/aud проверяются ПОСЛЕ проверки подписи: до crypto.verify эти claims
    // атакующий-контролируемые, и их проверка в логах (reason) позволяла бы
    // отличить Invalid audience от Invalid JWT signature — «оракул» конфигурации
    // (точный expected aud/iss). После успешной верификации claims авторизованы
    // подписью IdP и больше не являются атакующим-контролируемыми.
    function validateIssuerAudience(payload, expectedAudience) {
      // payload.iss нормализуется так же, как конфигурированный issuer (срез
      // трейлинг-слэша), иначе токен с iss "https://idp/" при конфиге
      // "https://idp" давал бы тихий 401 на все токены.
      const tokenIssuer = typeof payload.iss === 'string'
        ? payload.iss.replace(/\/+$/, '')
        : payload.iss;
      // createVerifier уже гарантирует непустой валидный issuer (new URL), —
      // отдельная проверка normalizedIssuer здесь была бы мёртвым guard-ом.
      if (tokenIssuer !== normalizedIssuer) {
        throw new Error(`Invalid issuer: expected ${normalizedIssuer}, got ${safeValue(payload.iss)}`);
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

      // Allowlist алгоритмов проверяется по заголовку токена ДО сетевых fetch
      // (findKeyForKid): это детерминированная проверка, не требующая JWKS —
      // мусорный alg не должен на холодном старте дёргать discovery + JWKS
      // (анти-амплификация), а заодно даёт чистый Unsupported algorithm вместо
      // невнятной Key not found / ошибки от crypto.createPublicKey.
      const algMap = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512' };
      const algorithm = algMap[header.alg];
      if (!algorithm) {
        throw new Error(`Unsupported algorithm: ${safeValue(header.alg)}`);
      }

      validateTemporalClaims(payload, Math.floor(Date.now() / 1000));

      const keyJwk = await findKeyForKid(header.kid);

      // kty проверяется после поиска ключа в JWKS (зависит от найденного
      // ключа), но до importKey, чтобы EC/HMAC-ключ давал чистый
      // Unsupported key type, а не невнятную ошибку от crypto.createPublicKey.
      if (keyJwk.kty !== 'RSA') {
        throw new Error(`Unsupported key type: ${safeValue(keyJwk.kty)}`);
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

      validateIssuerAudience(payload, expectedAudience);

      return { claims: payload };
    }

    return { verifyAccessToken };
  };
}

module.exports = {
  MODULE_NAME,
  createOidcVerifierFactory
};
