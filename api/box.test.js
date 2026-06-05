const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('./box');

const CODE = 'BABY-4821';
const ANSWER_TOKEN = 'answer_token_1234567890abc';
const DELETE_TOKEN = 'delete_token_1234567890abc';

function createRes() {
  return {
    headers: {},
    statusCode: 200,
    body: '',
    ended: false,
    headersSent: false,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      this.headersSent = true;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
    end() {
      this.ended = true;
      this.headersSent = true;
      return this;
    }
  };
}

async function call(req) {
  const res = createRes();
  await handler({
    method: 'POST',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...req
  }, res);
  let json = null;
  if (res.body) json = JSON.parse(res.body);
  return { res, json };
}

async function putOffer(payload = 'encrypted-offer') {
  return call({
    body: {
      action: 'put',
      code: CODE,
      role: 'offer',
      payload,
      answerToken: ANSWER_TOKEN,
      deleteToken: DELETE_TOKEN
    }
  });
}

test.beforeEach(() => {
  handler.__test.store.clear();
  handler.__test.rateStore.clear();
});

test('rejects invalid code and role', async () => {
  const invalidCode = await call({ body: { action: 'put', code: 'BAD', role: 'offer', payload: 'x' } });
  assert.equal(invalidCode.res.statusCode, 400);
  assert.equal(invalidCode.json.error, 'invalid_code');

  const invalidRole = await call({ body: { action: 'put', code: CODE, role: 'debug', payload: 'x' } });
  assert.equal(invalidRole.res.statusCode, 400);
  assert.equal(invalidRole.json.error, 'invalid_role');
});

test('rejects missing and oversized payloads', async () => {
  const missing = await call({ body: { action: 'put', code: CODE, role: 'offer', payload: '' } });
  assert.equal(missing.res.statusCode, 400);
  assert.equal(missing.json.error, 'invalid_payload');

  const large = 'x'.repeat(handler.__test.MAX_PAYLOAD_BYTES + 1);
  const oversized = await call({ body: { action: 'put', code: CODE, role: 'offer', payload: large } });
  assert.equal(oversized.res.statusCode, 400);
  assert.equal(oversized.json.error, 'invalid_payload');
});

test('stores and reads offer payload with POST action', async () => {
  const put = await putOffer();
  assert.equal(put.res.statusCode, 200);
  assert.equal(put.json.ok, true);

  const get = await call({ body: { action: 'get', code: CODE, role: 'offer' } });
  assert.equal(get.res.statusCode, 200);
  assert.equal(get.json.payload, 'encrypted-offer');
});

test('requires answer token before writing answer', async () => {
  await putOffer();

  const rejected = await call({
    body: { action: 'put', code: CODE, role: 'answer', payload: 'encrypted-answer', token: 'wrong_token_1234567890abc' }
  });
  assert.equal(rejected.res.statusCode, 403);
  assert.equal(rejected.json.error, 'invalid_token');

  const accepted = await call({
    body: { action: 'put', code: CODE, role: 'answer', payload: 'encrypted-answer', token: ANSWER_TOKEN }
  });
  assert.equal(accepted.res.statusCode, 200);
});

test('does not overwrite active role with a different payload', async () => {
  await putOffer('first');
  const samePayload = await putOffer('first');
  assert.equal(samePayload.res.statusCode, 200);

  const differentPayload = await putOffer('second');
  assert.equal(differentPayload.res.statusCode, 409);
  assert.equal(differentPayload.json.error, 'session_role_exists');
});

test('returns expired records as not found', async () => {
  await putOffer();
  const rec = handler.__test.store.get(`${CODE}/offer`);
  rec.expiresAt = Date.now() - 1;

  const expired = await call({ body: { action: 'get', code: CODE, role: 'offer' } });
  assert.equal(expired.res.statusCode, 404);
  assert.equal(expired.json.error, 'not_found');
});

test('deletes only with delete token when session metadata exists', async () => {
  await putOffer();

  const rejected = await call({ body: { action: 'delete', code: CODE, deleteToken: 'wrong_token_1234567890abc' } });
  assert.equal(rejected.res.statusCode, 403);

  const deleted = await call({ body: { action: 'delete', code: CODE, deleteToken: DELETE_TOKEN } });
  assert.equal(deleted.res.statusCode, 200);

  const offer = await call({ body: { action: 'get', code: CODE, role: 'offer' } });
  assert.equal(offer.res.statusCode, 404);
});

test('rejects unsupported methods and includes noindex API header', async () => {
  const res = createRes();
  await handler({ method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers['x-robots-tag'], 'noindex, noarchive');
});

test('rate limits abusive clients', async () => {
  let result = null;
  for (let i = 0; i <= handler.__test.RATE_MAX_REQUESTS; i++) {
    result = await call({ body: { action: 'get', code: CODE, role: 'offer' } });
  }
  assert.equal(result.res.statusCode, 429);
  assert.equal(result.json.error, 'rate_limited');
});

test('server errors do not include internal details', async () => {
  const original = handler.__test.store.entries;
  handler.__test.store.entries = () => {
    throw new Error('internal detail');
  };

  const result = await call({ body: { action: 'get', code: CODE, role: 'offer' } });
  handler.__test.store.entries = original;

  assert.equal(result.res.statusCode, 500);
  assert.deepEqual(result.json, { error: 'server_error' });
});
