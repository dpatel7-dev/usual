'use strict';
// A small web server on this computer only (127.0.0.1), for an app's own
// window. Nothing else can use it:
//   - it only answers to 127.0.0.1 / localhost by name (no tricks with other names)
//   - every page lives under a secret path, and every request that changes
//     something must carry the secret in a header, which other websites can't send
//
//   const s = await Local.serve({ port, secret, web: '/path/to/web', config: () => ({…}),
//     api: async (what, body, req) => result, raw: (req, res, rest) => handled? });

const fs = require('fs');
const http = require('http');
const Look = require('./look');
const path = require('path');
const crypto = require('crypto');

const TYPES = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.aiff': 'audio/aiff', '.aif': 'audio/aiff', '.mp4': 'audio/mp4', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

/** A secret kept in a file (made once, readable by you only). */
function secretIn(file) {
  try { const s = fs.readFileSync(file, 'utf8').trim(); if (/^[a-f0-9]{32}$/.test(s)) return s; } catch { /* make one */ }
  const s = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, s + '\n', { mode: 0o600 });
  return s;
}

function serve({ port = 0, secret, web, config = () => ({}), api, raw, outside, onListen, header = 'x-app-secret', referrer = 'no-referrer' }) {
  const base = `/${secret}`;
  const server = http.createServer(async (req, res) => {
    const addr = server.address();
    const host = String(req.headers.host || '');
    if (host !== `127.0.0.1:${addr.port}` && host !== `localhost:${addr.port}`) { res.writeHead(403); return res.end(); }
    const url = new URL(req.url, `http://${host}`);
    const send = (status, body, type = 'application/json') => {
      const data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      res.writeHead(status, { 'content-type': type, 'content-length': data.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': referrer });
      res.end(data);
    };
    if (url.pathname === '/ping') return send(200, { ok: true });
    // a few addresses outside the secret one, for helpers that pair first (they bring their own key)
    if (outside) {
      try { if (await outside(req, res, url, send)) return; } catch (e) { return send(e.status || 500, { error: e.message || 'Something went wrong.' }); }
    }
    if (!url.pathname.startsWith(base + '/') && url.pathname !== base) return send(404, { error: 'not here' });
    const rest = url.pathname.slice(base.length) || '/';
    if (rest === '/__look') return send(200, { look: Look.read() }); // light or dark, set in pca
    try {
      if (raw && (await raw(req, res, rest, url, send))) return;
      if (rest.startsWith('/api/')) {
        if (req.method !== 'POST' || req.headers[header] !== secret) return send(403, { error: 'not allowed' });
        const chunks = [];
        let size = 0;
        for await (const c of req) { size += c.length; if (size > 50 * 1024 * 1024) return send(413, { error: 'too big' }); chunks.push(c); }
        let body = {};
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { return send(400, { error: 'not JSON' }); }
        const out = await api(rest.slice(5), body, req);
        return send(200, out === undefined ? { ok: true } : out);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'not allowed' });
      let file = rest === '/' ? 'index.html' : rest.slice(1);
      if (!/\.[a-z0-9]+$/i.test(file)) file += '.html';
      const full = path.resolve(web, file);
      if (!full.startsWith(path.resolve(web) + path.sep) || !fs.existsSync(full)) return send(404, { error: 'not here' });
      let data = fs.readFileSync(full);
      if (full.endsWith('.html')) {
        const conf = JSON.stringify({ ...config(req, url), secret, base }).replace(/</g, '\\u003c');
        data = Buffer.from(Look.inject(data.toString('utf8').replace('__CONFIG__', conf), Look.read(), `${base}/__look`));
      }
      return send(200, data, TYPES[path.extname(full)] || 'application/octet-stream');
    } catch (e) {
      return send(e.status || 500, { error: e.message || 'Something went wrong.' });
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}${base}/`;
      if (onListen) onListen(url);
      resolve({ url, port: server.address().port, server, close: () => new Promise((r) => server.close(r)) });
    });
  });
}

/** Is our server already answering on this port? */
async function alive(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/ping`, { signal: AbortSignal.timeout(800) }); return r.ok; } catch { return false; }
}

/** Ask our own running server something (from the command line). */
async function ask(port, secret, what, body = {}, header = 'x-app-secret') {
  const r = await fetch(`http://127.0.0.1:${port}/${secret}/api/${what}`, { method: 'POST', headers: { 'content-type': 'application/json', [header]: secret }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `It answered ${r.status}.`);
  return j;
}

module.exports = { serve, secretIn, alive, ask, TYPES };
