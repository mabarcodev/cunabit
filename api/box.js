const TTL_MS = 5 * 60 * 1000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_ACTIVE_RECORDS = 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 120;
const CODE_REGEX = /^[A-Z]{4}-\d{4}$/;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{22,}$/;
const VALID_ROLES = new Set(['offer', 'answer']);
const VALID_ACTIONS = new Set(['put', 'get', 'delete']);

const memoryStore = globalThis.__cunabitStore || (globalThis.__cunabitStore = new Map());
const memoryRateStore = globalThis.__cunabitRateStore || (globalThis.__cunabitRateStore = new Map());

function redisUrl() {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
}

function redisToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
}

function hasRedisConfig() {
  return Boolean(redisUrl() && redisToken());
}

function keyPrefix() {
  return process.env.CUNABIT_KV_PREFIX || 'cunabit:box';
}

function storageKey(key) {
  return `${keyPrefix()}:${key.replace(/\//g, ':')}`;
}

async function redisCommand(command) {
  const endpoint = redisUrl().replace(/\/+$/, '');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${redisToken()}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error('store_unavailable');
  return body.result;
}

function createMemoryStorage() {
  return {
    type: 'memory',
    async cleanup(now = Date.now()) {
      for (const [key, rec] of memoryStore.entries()) {
        if (!rec || rec.expiresAt <= now) memoryStore.delete(key);
      }
      for (const [key, hits] of memoryRateStore.entries()) {
        const freshHits = hits.filter(ts => now - ts < RATE_WINDOW_MS);
        if (freshHits.length) memoryRateStore.set(key, freshHits);
        else memoryRateStore.delete(key);
      }
    },
    async get(key) {
      const rec = memoryStore.get(key);
      if (!rec) return null;
      if (Date.now() > rec.expiresAt) {
        memoryStore.delete(key);
        return null;
      }
      return rec.value;
    },
    async set(key, value, ttlMs, options = {}) {
      const existing = await this.get(key);
      if (options.nx && existing) return false;
      memoryStore.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
      });
      return true;
    },
    async del(keys) {
      for (const key of keys) memoryStore.delete(key);
    },
    async countMeta() {
      let count = 0;
      for (const key of memoryStore.keys()) {
        if (key.endsWith('/meta')) count += 1;
      }
      return count;
    },
    async isRateLimited(key, now = Date.now()) {
      const hits = (memoryRateStore.get(key) || []).filter(ts => now - ts < RATE_WINDOW_MS);
      hits.push(now);
      memoryRateStore.set(key, hits);
      return hits.length > RATE_MAX_REQUESTS;
    }
  };
}

function createRedisStorage() {
  return {
    type: 'redis',
    async cleanup() {},
    async get(key) {
      const result = await redisCommand(['GET', storageKey(key)]);
      return result ? JSON.parse(result) : null;
    },
    async set(key, value, ttlMs, options = {}) {
      const command = ['SET', storageKey(key), JSON.stringify(value), 'PX', ttlMs];
      if (options.nx) command.push('NX');
      return await redisCommand(command) === 'OK';
    },
    async del(keys) {
      if (!keys.length) return;
      await redisCommand(['DEL', ...keys.map(storageKey)]);
    },
    async countMeta() {
      return 0;
    },
    async isRateLimited(key) {
      const redisKey = storageKey(`rate/${key}`);
      const count = Number(await redisCommand(['INCR', redisKey]) || 0);
      if (count === 1) await redisCommand(['PEXPIRE', redisKey, RATE_WINDOW_MS]);
      return count > RATE_MAX_REQUESTS;
    }
  };
}

function createStorage() {
  return hasRedisConfig() ? createRedisStorage() : createMemoryStorage();
}

function setCommonHeaders(res) {
  const allowedOrigin = process.env.CUNABIT_ALLOWED_ORIGIN || 'https://cunabit.vercel.app';
  res.setHeader('access-control-allow-origin', allowedOrigin);
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-robots-tag', 'noindex, noarchive');
}

function send(res, status, body) {
  res.status(status).send(JSON.stringify(body));
}

function clientKey(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function parseBody(req) {
  const contentLength = Number(req.headers && req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES + 2048) {
    const err = new Error('payload_too_large');
    err.status = 413;
    throw err;
  }
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}

function validateCodeRole(code, role) {
  if (!code || !CODE_REGEX.test(code)) return 'invalid_code';
  if (role !== undefined && !VALID_ROLES.has(role)) return 'invalid_role';
  return null;
}

function isValidPayload(payload) {
  return typeof payload === 'string' && payload.length > 0 && payload.length <= MAX_PAYLOAD_BYTES;
}

function sessionMetaKey(code) {
  return `${code}/meta`;
}

function roleKey(code, role) {
  return `${code}/${role}`;
}

async function deleteSession(storage, code) {
  await storage.del([sessionMetaKey(code), roleKey(code, 'offer'), roleKey(code, 'answer')]);
}

function ensureToken(value) {
  return typeof value === 'string' && TOKEN_REGEX.test(value);
}

async function setRolePayload(storage, key, value) {
  const written = await storage.set(key, value, TTL_MS, { nx: true });
  if (written) return { ok: true };

  const existing = await storage.get(key);
  if (existing && existing.payload === value.payload) {
    await storage.set(key, value, TTL_MS);
    return { ok: true };
  }

  return { ok: false, status: 409, body: { error: 'session_role_exists' } };
}

async function handlePut(storage, body) {
  const { code, role, payload, answerToken, deleteToken, token } = body;
  const validationError = validateCodeRole(code, role);
  if (validationError) return { status: 400, body: { error: validationError } };
  if (!isValidPayload(payload)) return { status: 400, body: { error: 'invalid_payload' } };

  const now = Date.now();
  const metaKey = sessionMetaKey(code);
  const existingMeta = await storage.get(metaKey);
  const key = roleKey(code, role);

  if (role === 'offer') {
    if (!ensureToken(answerToken) || !ensureToken(deleteToken)) {
      return { status: 400, body: { error: 'invalid_token' } };
    }

    if (!existingMeta && storage.type === 'memory' && await storage.countMeta() >= MAX_ACTIVE_RECORDS) {
      return { status: 429, body: { error: 'too_many_sessions' } };
    }

    if (existingMeta && (existingMeta.answerToken !== answerToken || existingMeta.deleteToken !== deleteToken)) {
      return { status: 409, body: { error: 'session_exists' } };
    }

    const meta = { answerToken, deleteToken, createdAt: existingMeta ? existingMeta.createdAt : now };
    const metaWritten = await storage.set(metaKey, meta, TTL_MS, { nx: !existingMeta });
    if (!metaWritten && !existingMeta) return { status: 409, body: { error: 'session_exists' } };
  }

  if (role === 'answer') {
    if (!existingMeta) {
      await deleteSession(storage, code);
      return { status: 404, body: { error: 'not_found' } };
    }
    if (!ensureToken(token) || token !== existingMeta.answerToken) {
      return { status: 403, body: { error: 'invalid_token' } };
    }
  }

  const roleWrite = await setRolePayload(storage, key, { payload, createdAt: now });
  if (!roleWrite.ok) return roleWrite;

  return { status: 200, body: { ok: true, ttl: TTL_MS, store: storage.type } };
}

async function handleGet(storage, body) {
  const { code, role } = body;
  const validationError = validateCodeRole(code, role);
  if (validationError) return { status: 400, body: { error: validationError } };

  const rec = await storage.get(roleKey(code, role));
  if (!rec) return { status: 404, body: { error: 'not_found' } };
  return { status: 200, body: { payload: rec.payload } };
}

async function handleDelete(storage, body) {
  const { code, deleteToken } = body;
  const validationError = validateCodeRole(code);
  if (validationError) return { status: 400, body: { error: validationError } };

  const meta = await storage.get(sessionMetaKey(code));
  if (meta && (!ensureToken(deleteToken) || deleteToken !== meta.deleteToken)) {
    return { status: 403, body: { error: 'invalid_token' } };
  }

  await deleteSession(storage, code);
  return { status: 200, body: { ok: true } };
}

async function handler(req, res) {
  try {
    const storage = createStorage();
    await storage.cleanup();
    setCommonHeaders(res);

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
    if (await storage.isRateLimited(clientKey(req))) return send(res, 429, { error: 'rate_limited' });

    let body;
    try {
      body = parseBody(req);
    } catch (err) {
      return send(res, err.status || 400, { error: err.message === 'payload_too_large' ? 'payload_too_large' : 'invalid_json' });
    }

    const action = body && body.action ? body.action : 'put';
    if (!VALID_ACTIONS.has(action)) return send(res, 400, { error: 'invalid_action' });

    const result = action === 'put'
      ? await handlePut(storage, body)
      : action === 'get'
        ? await handleGet(storage, body)
        : await handleDelete(storage, body);

    return send(res, result.status, result.body);
  } catch {
    if (!res.headersSent) setCommonHeaders(res);
    return send(res, 500, { error: 'server_error' });
  }
}

handler.__test = {
  createMemoryStorage,
  createRedisStorage,
  createStorage,
  redisCommand,
  storageKey,
  store: memoryStore,
  rateStore: memoryRateStore,
  TTL_MS,
  MAX_PAYLOAD_BYTES,
  MAX_ACTIVE_RECORDS,
  RATE_MAX_REQUESTS
};

module.exports = handler;
