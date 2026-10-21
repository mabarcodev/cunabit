import { DurableObject } from 'cloudflare:workers';

const TTL_MS = 5 * 60 * 1000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_BODY_BYTES = MAX_PAYLOAD_BYTES + 2048;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 120;
const CODE_REGEX = /^[A-Z]{4}-\d{4}$/;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{22,}$/;
const VALID_ROLES = new Set(['offer', 'answer']);
const VALID_ACTIONS = new Set(['put', 'get', 'delete']);

function result(status, body) {
  return { status, body };
}

function ensureToken(value) {
  return typeof value === 'string' && TOKEN_REGEX.test(value);
}

function isValidPayload(payload) {
  return typeof payload === 'string' && payload.length > 0 && payload.length <= MAX_PAYLOAD_BYTES;
}

// Un objeto por código de emparejamiento. Cloudflare garantiza una única instancia que
// atiende las peticiones de una en una, así que cámara y monitor nunca se pisan.
// Solo guarda el payload cifrado en el navegador con el PIN y los tokens efímeros.
export class PairingBox extends DurableObject {
  async #read(key, now) {
    const rec = await this.ctx.storage.get(key);
    if (!rec) return null;
    if (rec.expiresAt <= now) {
      await this.ctx.storage.delete(key);
      return null;
    }
    return rec.value;
  }

  async #write(key, value, now) {
    await this.ctx.storage.put(key, { value, expiresAt: now + TTL_MS });
    // La última escritura es la que caduca más tarde: la alarma borra todo cuando ya
    // nada está vigente, aunque nadie vuelva a consultar el código.
    await this.ctx.storage.setAlarm(now + TTL_MS);
  }

  async #clear() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async handle(action, body) {
    const now = Date.now();
    if (action === 'put') return this.#put(body, now);
    if (action === 'get') return this.#get(body, now);
    return this.#remove(body, now);
  }

  async #put({ role, payload, answerToken, deleteToken, token }, now) {
    const meta = await this.#read('meta', now);

    if (role === 'offer') {
      if (!ensureToken(answerToken) || !ensureToken(deleteToken)) {
        return result(400, { error: 'invalid_token' });
      }
      if (meta && (meta.answerToken !== answerToken || meta.deleteToken !== deleteToken)) {
        return result(409, { error: 'session_exists' });
      }
      await this.#write('meta', meta || { answerToken, deleteToken, createdAt: now }, now);
    }

    if (role === 'answer') {
      if (!meta) {
        await this.#clear();
        return result(404, { error: 'not_found' });
      }
      if (!ensureToken(token) || token !== meta.answerToken) {
        return result(403, { error: 'invalid_token' });
      }
    }

    const existing = await this.#read(role, now);
    if (existing && existing.payload !== payload) {
      return result(409, { error: 'session_role_exists' });
    }
    await this.#write(role, { payload, createdAt: now }, now);
    return result(200, { ok: true, ttl: TTL_MS, store: 'durable-object' });
  }

  async #get({ role }, now) {
    const rec = await this.#read(role, now);
    if (!rec) return result(404, { error: 'not_found' });
    return result(200, { payload: rec.payload });
  }

  async #remove({ deleteToken }, now) {
    const meta = await this.#read('meta', now);
    if (meta && (!ensureToken(deleteToken) || deleteToken !== meta.deleteToken)) {
      return result(403, { error: 'invalid_token' });
    }
    await this.#clear();
    return result(200, { ok: true });
  }

  async alarm() {
    const now = Date.now();
    const entries = await this.ctx.storage.list();
    let next = Infinity;
    for (const [key, rec] of entries) {
      if (!rec || rec.expiresAt <= now) await this.ctx.storage.delete(key);
      else next = Math.min(next, rec.expiresAt);
    }
    if (next !== Infinity) await this.ctx.storage.setAlarm(next);
  }
}

// Un objeto por IP de cliente. El contador vive solo en memoria: no escribe en disco ni
// conserva la IP; si Cloudflare recicla la instancia, la ventana empieza de cero.
export class RateLimiter extends DurableObject {
  #hits = [];

  hit() {
    const now = Date.now();
    this.#hits = this.#hits.filter(ts => now - ts < RATE_WINDOW_MS);
    this.#hits.push(now);
    return this.#hits.length > RATE_MAX_REQUESTS;
  }
}

function apiHeaders(request, env) {
  return {
    'access-control-allow-origin': env.CUNABIT_ALLOWED_ORIGIN || new URL(request.url).origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex, noarchive'
  };
}

async function readBody(request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return { error: 'payload_too_large' };
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: 'payload_too_large' };
  if (!text) return { body: {} };
  try {
    const body = JSON.parse(text);
    return { body: body && typeof body === 'object' ? body : {} };
  } catch {
    return { error: 'invalid_json' };
  }
}

function validate(body) {
  const action = body.action || 'put';
  if (!VALID_ACTIONS.has(action)) return { error: 'invalid_action' };
  if (typeof body.code !== 'string' || !CODE_REGEX.test(body.code)) return { error: 'invalid_code' };
  if (action !== 'delete' && !VALID_ROLES.has(body.role)) return { error: 'invalid_role' };
  if (action === 'put' && !isValidPayload(body.payload)) return { error: 'invalid_payload' };
  return { action };
}

async function handleApi(request, env) {
  const headers = apiHeaders(request, env);
  const send = (status, body) => new Response(JSON.stringify(body), { status, headers });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return send(405, { error: 'method_not_allowed' });

  try {
    const clientIp = request.headers.get('cf-connecting-ip') || 'unknown';
    const limiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(clientIp));
    if (await limiter.hit()) return send(429, { error: 'rate_limited' });

    const { body, error: bodyError } = await readBody(request);
    if (bodyError) return send(bodyError === 'payload_too_large' ? 413 : 400, { error: bodyError });

    // Validar antes de tocar el Durable Object: un código inválido no debe crear objetos.
    const { action, error } = validate(body);
    if (error) return send(400, { error });

    const box = env.PAIRING.get(env.PAIRING.idFromName(body.code));
    const out = await box.handle(action, body);
    return send(out.status, out.body);
  } catch (err) {
    // Errores transitorios de Durable Objects (sobrecarga, reinicio): el cliente reintenta en 5xx.
    if (err && (err.retryable || err.overloaded)) {
      console.error('[box] store unavailable', { message: err.message });
      return send(503, { error: 'store_unavailable' });
    }
    console.error('[box] unhandled', { message: err && err.message, stack: err && err.stack });
    return send(500, { error: 'server_error' });
  }
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/box') return handleApi(request, env);
    return env.ASSETS.fetch(request);
  }
};

export const __test = { TTL_MS, MAX_PAYLOAD_BYTES, RATE_MAX_REQUESTS };
