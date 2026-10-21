import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { PairingBox, RateLimiter, __test } from './worker.mjs';

const CODE = 'BABY-4821';
const ANSWER_TOKEN = 'answer_token_1234567890abc';
const DELETE_TOKEN = 'delete_token_1234567890abc';

function createStorage() {
  const data = new Map();
  const storage = {
    data,
    alarm: null,
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : undefined; },
    async put(key, value) { data.set(key, structuredClone(value)); },
    async delete(key) { return data.delete(key); },
    async deleteAll() { data.clear(); },
    async list() { return new Map([...data].map(([key, value]) => [key, structuredClone(value)])); },
    async setAlarm(ts) { storage.alarm = ts; },
    async deleteAlarm() { storage.alarm = null; }
  };
  return storage;
}

// Simula un namespace de Durable Objects: una instancia por nombre y llamadas RPC
// siempre asíncronas que solo ven métodos públicos y devuelven copias.
function createNamespace(Klass, env) {
  const instances = new Map();
  return {
    instances,
    idFromName(name) { return `id:${name}`; },
    get(id) {
      if (!instances.has(id)) instances.set(id, new Klass({ id, storage: createStorage() }, env));
      const instance = instances.get(id);
      return new Proxy({}, {
        get(_, prop) {
          if (prop === 'then' || typeof instance[prop] !== 'function') return undefined;
          return async (...args) => structuredClone(await instance[prop](...args));
        }
      });
    }
  };
}

function createEnv() {
  const env = { ASSETS: { fetch: async () => new Response('asset') } };
  env.PAIRING = createNamespace(PairingBox, env);
  env.RATE_LIMITER = createNamespace(RateLimiter, env);
  return env;
}

function box(env, code = CODE) {
  return env.PAIRING.instances.get(`id:${code}`);
}

async function call(env, body, { method = 'POST', ip = '203.0.113.7', raw } = {}) {
  const init = { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip } };
  if (method === 'POST') init.body = raw ?? JSON.stringify(body);
  const res = await worker.fetch(new Request('https://cunabit.example/api/box', init), env);
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : null };
}

function putOffer(env, payload = 'encrypted-offer', tokens = {}) {
  return call(env, {
    action: 'put',
    code: CODE,
    role: 'offer',
    payload,
    answerToken: ANSWER_TOKEN,
    deleteToken: DELETE_TOKEN,
    ...tokens
  });
}

test('only handle and alarm are reachable over RPC', () => {
  assert.deepEqual(Object.getOwnPropertyNames(PairingBox.prototype).sort(), ['alarm', 'constructor', 'handle']);
  assert.deepEqual(Object.getOwnPropertyNames(RateLimiter.prototype).sort(), ['constructor', 'hit']);
});

test('rejects invalid input without creating a pairing object', async () => {
  const env = createEnv();
  const cases = [
    [{ action: 'put', code: 'BAD', role: 'offer', payload: 'x' }, 'invalid_code'],
    [{ action: 'put', code: CODE, role: 'debug', payload: 'x' }, 'invalid_role'],
    [{ action: 'put', code: CODE, role: 'offer', payload: '' }, 'invalid_payload'],
    [{ action: 'put', code: CODE, role: 'offer', payload: 'x'.repeat(__test.MAX_PAYLOAD_BYTES + 1) }, 'invalid_payload'],
    [{ action: 'drop', code: CODE }, 'invalid_action'],
    [{ action: 'get', code: CODE }, 'invalid_role']
  ];
  for (const [body, error] of cases) {
    const { res, json } = await call(env, body);
    assert.equal(res.status, 400, error);
    assert.deepEqual(json, { error });
  }
  assert.equal(env.PAIRING.instances.size, 0);
});

test('rejects malformed and oversized bodies', async () => {
  const env = createEnv();
  const invalid = await call(env, null, { raw: '{nope' });
  assert.equal(invalid.res.status, 400);
  assert.deepEqual(invalid.json, { error: 'invalid_json' });

  const oversized = await call(env, null, { raw: 'x'.repeat(__test.MAX_PAYLOAD_BYTES + 4096) });
  assert.equal(oversized.res.status, 413);
  assert.deepEqual(oversized.json, { error: 'payload_too_large' });

  const notObject = await call(env, null, { raw: 'null' });
  assert.deepEqual(notObject.json, { error: 'invalid_code' });
});

test('runs the full pairing flow', async () => {
  const env = createEnv();
  const put = await putOffer(env);
  assert.equal(put.res.status, 200);
  assert.equal(put.json.store, 'durable-object');

  const offer = await call(env, { action: 'get', code: CODE, role: 'offer' });
  assert.equal(offer.json.payload, 'encrypted-offer');

  const wrongAnswer = await call(env, { action: 'put', code: CODE, role: 'answer', payload: 'a', token: 'wrong_token_1234567890abc' });
  assert.equal(wrongAnswer.res.status, 403);

  const answer = await call(env, { action: 'put', code: CODE, role: 'answer', payload: 'encrypted-answer', token: ANSWER_TOKEN });
  assert.equal(answer.res.status, 200);
  const readAnswer = await call(env, { action: 'get', code: CODE, role: 'answer' });
  assert.equal(readAnswer.json.payload, 'encrypted-answer');

  const wrongDelete = await call(env, { action: 'delete', code: CODE, deleteToken: 'wrong_token_1234567890abc' });
  assert.equal(wrongDelete.res.status, 403);

  const deleted = await call(env, { action: 'delete', code: CODE, deleteToken: DELETE_TOKEN });
  assert.equal(deleted.res.status, 200);
  assert.equal(box(env).ctx.storage.data.size, 0);
  assert.equal(box(env).ctx.storage.alarm, null);

  const gone = await call(env, { action: 'get', code: CODE, role: 'offer' });
  assert.equal(gone.res.status, 404);
});

test('rejects an answer when no offer exists', async () => {
  const env = createEnv();
  const { res, json } = await call(env, { action: 'put', code: CODE, role: 'answer', payload: 'a', token: ANSWER_TOKEN });
  assert.equal(res.status, 404);
  assert.deepEqual(json, { error: 'not_found' });
});

test('does not let another session take over an active code', async () => {
  const env = createEnv();
  await putOffer(env, 'first');
  assert.equal((await putOffer(env, 'first')).res.status, 200);

  const differentPayload = await putOffer(env, 'second');
  assert.equal(differentPayload.res.status, 409);
  assert.equal(differentPayload.json.error, 'session_role_exists');

  const differentTokens = await putOffer(env, 'first', { answerToken: 'other_token_1234567890abcd' });
  assert.equal(differentTokens.res.status, 409);
  assert.equal(differentTokens.json.error, 'session_exists');
});

test('expires records after the TTL and the alarm deletes them', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const env = createEnv();
  await putOffer(env);
  assert.equal(box(env).ctx.storage.alarm, 1_000_000 + __test.TTL_MS);

  t.mock.timers.tick(60_000);
  await call(env, { action: 'put', code: CODE, role: 'answer', payload: 'encrypted-answer', token: ANSWER_TOKEN });
  const answerExpiry = 1_060_000 + __test.TTL_MS;
  assert.equal(box(env).ctx.storage.alarm, answerExpiry);

  t.mock.timers.tick(__test.TTL_MS - 59_000);
  const expiredOffer = await call(env, { action: 'get', code: CODE, role: 'offer' });
  assert.equal(expiredOffer.res.status, 404);

  // La oferta caducó antes que la respuesta: la alarma borra lo vencido y se reprograma.
  await box(env).alarm();
  assert.deepEqual([...box(env).ctx.storage.data.keys()], ['answer']);
  assert.equal(box(env).ctx.storage.alarm, answerExpiry);

  t.mock.timers.tick(60_000);
  await box(env).alarm();
  assert.equal(box(env).ctx.storage.data.size, 0);
});

test('rate limits per client IP', async () => {
  const env = createEnv();
  let last = null;
  for (let i = 0; i <= __test.RATE_MAX_REQUESTS; i++) {
    last = await call(env, { action: 'get', code: CODE, role: 'offer' });
  }
  assert.equal(last.res.status, 429);
  assert.deepEqual(last.json, { error: 'rate_limited' });

  const otherClient = await call(env, { action: 'get', code: CODE, role: 'offer' }, { ip: '198.51.100.9' });
  assert.equal(otherClient.res.status, 404);
});

test('answers OPTIONS and rejects other methods with API headers', async () => {
  const env = createEnv();
  const options = await call(env, null, { method: 'OPTIONS' });
  assert.equal(options.res.status, 204);

  const get = await call(env, null, { method: 'GET' });
  assert.equal(get.res.status, 405);
  assert.equal(get.res.headers.get('x-robots-tag'), 'noindex, noarchive');
  assert.equal(get.res.headers.get('cache-control'), 'no-store');
  assert.equal(get.res.headers.get('access-control-allow-origin'), 'https://cunabit.example');
});

test('transient Durable Object errors answer 503 store_unavailable', async (t) => {
  const env = createEnv();
  env.PAIRING.get = () => ({
    handle: async () => { throw Object.assign(new Error('Durable Object is overloaded'), { overloaded: true }); }
  });
  t.mock.method(console, 'error', () => {});

  const { res, json } = await call(env, { action: 'get', code: CODE, role: 'offer' });
  assert.equal(res.status, 503);
  assert.deepEqual(json, { error: 'store_unavailable' });
});

test('unexpected errors answer 500 without internal details', async (t) => {
  const env = createEnv();
  env.PAIRING.get = () => ({ handle: async () => { throw new Error('internal detail'); } });
  const logged = t.mock.method(console, 'error', () => {});

  const { res, json } = await call(env, { action: 'get', code: CODE, role: 'offer' });
  assert.equal(res.status, 500);
  assert.deepEqual(json, { error: 'server_error' });
  assert.equal(logged.mock.calls[0].arguments[0], '[box] unhandled');
});

test('serves everything outside the API from static assets', async () => {
  const res = await worker.fetch(new Request('https://cunabit.example/'), createEnv());
  assert.equal(await res.text(), 'asset');
});
