import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import boxHandler from '../api/box.js';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 70 * 1024) {
        req.destroy();
        rejectBody(new Error('payload_too_large'));
      }
    });
    req.on('end', () => resolveBody(body));
    req.on('error', rejectBody);
  });
}

function adaptResponse(res) {
  return {
    headersSent: false,
    setHeader(key, value) {
      res.setHeader(key, value);
      this.headersSent = true;
      return this;
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    send(body) {
      this.headersSent = true;
      res.end(body);
      return this;
    },
    end() {
      this.headersSent = true;
      res.end();
      return this;
    }
  };
}

async function handleApi(req, res) {
  try {
    req.body = await readBody(req);
    req.query = {};
    await boxHandler(req, adaptResponse(res));
  } catch {
    res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'payload_too_large' }));
  }
}

async function handleStatic(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const fullPath = resolve(root, file);
  if (!fullPath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const data = await readFile(fullPath);
    res.writeHead(200, { 'content-type': types[extname(fullPath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

createServer((req, res) => {
  if (req.url && req.url.startsWith('/api/box')) {
    handleApi(req, res);
    return;
  }
  handleStatic(req, res);
}).listen(port, '127.0.0.1', () => {
  console.log(`CUNABIT local: http://127.0.0.1:${port}/`);
});
