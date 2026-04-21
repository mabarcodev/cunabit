// Cunabit signaling box — Vercel Serverless Function
// Equivalente al netlify/functions/box.js original, adaptado al
// signature (req, res) de Vercel.
//
// Nota importante: el almacenamiento es en memoria del contenedor
// serverless. Funciona porque ambos peers consultan el mismo lambda
// "caliente" durante los pocos segundos del emparejamiento. Si Vercel
// arranca instancias frías distintas, el monitor podría no encontrar
// la oferta — basta con reintentar (la lógica del cliente ya lo hace).

const TTL_MS = 5 * 60 * 1000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const CODE_REGEX = /^[A-Z]{4}-\d{4}$/;
const VALID_ROLES = new Set(['offer', 'answer']);

// Persistir el Map en globalThis para que sobreviva entre invocaciones
// "calientes" del mismo contenedor.
const store = globalThis.__cunabitStore || (globalThis.__cunabitStore = new Map());

function cleanup() {
  const now = Date.now();
  for (const [key, rec] of store.entries()) {
    if (rec.expiresAt < now) store.delete(key);
  }
}

function setCommonHeaders(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('cache-control', 'no-store');
}

function send(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json');
  res.send(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  try {
    cleanup();
    setCommonHeaders(res);

    const method = req.method;

    if (method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); }
        catch { return send(res, 400, { error: 'invalid_json' }); }
      }
      if (!body || typeof body !== 'object') body = {};

      const { code, role, payload } = body;
      if (!code || !CODE_REGEX.test(code)) return send(res, 400, { error: 'invalid_code' });
      if (!VALID_ROLES.has(role)) return send(res, 400, { error: 'invalid_role' });
      if (typeof payload !== 'string' || payload.length === 0) return send(res, 400, { error: 'missing_payload' });
      if (payload.length > MAX_PAYLOAD_BYTES) return send(res, 413, { error: 'payload_too_large' });

      store.set(`${code}/${role}`, {
        payload,
        createdAt: Date.now(),
        expiresAt: Date.now() + TTL_MS
      });
      return send(res, 200, { ok: true, ttl: TTL_MS });
    }

    if (method === 'GET') {
      const q = req.query || {};
      const code = q.code;
      const role = q.role;
      if (!code || !CODE_REGEX.test(code)) return send(res, 400, { error: 'invalid_code' });
      if (!VALID_ROLES.has(role)) return send(res, 400, { error: 'invalid_role' });

      const rec = store.get(`${code}/${role}`);
      if (!rec) return send(res, 404, { error: 'not_found' });
      if (Date.now() > rec.expiresAt) {
        store.delete(`${code}/${role}`);
        return send(res, 404, { error: 'expired' });
      }
      return send(res, 200, { payload: rec.payload });
    }

    if (method === 'DELETE') {
      const q = req.query || {};
      const code = q.code;
      if (!code || !CODE_REGEX.test(code)) return send(res, 400, { error: 'invalid_code' });
      store.delete(`${code}/offer`);
      store.delete(`${code}/answer`);
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'method_not_allowed' });
  } catch (err) {
    return send(res, 500, {
      error: 'server_error',
      detail: String((err && err.message) || err)
    });
  }
};
