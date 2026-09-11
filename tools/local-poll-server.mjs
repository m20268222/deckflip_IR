#!/usr/bin/env node
// Node.js builtins only. This process never connects to an external backend.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, realpath, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BODY_LIMIT = 4096;
const WINDOW_MS = 60_000;
const MAX_ROWS = 20_000;
const POLL_ID = /^[A-Za-z0-9_-]{1,80}$/;
const TABLES = new Map([
  ['deck_votes', { field: 'choice', rows: [] }],
  ['deck_questions', { field: 'body', rows: [] }],
]);
const buckets = new Map();
let nextId = 1;

function options(args) {
  const out = { lan: false, port: 8749, help: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lan') out.lan = true;
    else if (args[i] === '--help' || args[i] === '-h') out.help = true;
    else if (args[i] === '--port') {
      const value = args[++i];
      if (!/^\d{1,5}$/.test(value ?? '') || Number(value) > 65535) {
        throw new Error('--port requires an integer from 0 to 65535.');
      }
      out.port = Number(value);
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return out;
}

function lanAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address))];
}

function headers(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // Keep local operation local even if a page still has old backend constants.
  res.setHeader('Content-Security-Policy', "connect-src 'self'; form-action 'self'; base-uri 'self'");
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function error(res, status, message) {
  json(res, status, { message });
}

function consumeRate(req, res, kind) {
  const now = Date.now();
  if (buckets.size > 1024) {
    for (const [key, value] of buckets) {
      if (now - value.start >= WINDOW_MS) buckets.delete(key);
    }
  }
  const key = `${req.socket.remoteAddress ?? 'unknown'}:${kind}`;
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.start >= WINDOW_MS) {
    bucket = { start: now, count: 0 };
    buckets.set(key, bucket);
  }
  const max = kind === 'write' ? 60 : 300;
  if (++bucket.count <= max) return true;
  res.setHeader('Retry-After', String(Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.start)) / 1000))));
  error(res, 429, 'Too many requests. Please wait before trying again.');
  return false;
}

function requestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let stopped = false;
    const fail = (status, message) => {
      if (stopped) return;
      stopped = true;
      reject(Object.assign(new Error(message), { status }));
    };
    if (Number(req.headers['content-length'] ?? 0) > BODY_LIMIT) {
      req.resume();
      fail(413, 'JSON body must be no larger than 4096 bytes.');
      return;
    }
    req.on('data', (chunk) => {
      if (stopped) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        chunks.length = 0;
        fail(413, 'JSON body must be no larger than 4096 bytes.');
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (stopped) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        stopped = true;
        resolve(value);
      } catch {
        fail(400, 'Request body must be valid JSON.');
      }
    });
    req.on('error', () => fail(400, 'Request body could not be read.'));
    req.on('aborted', () => fail(400, 'Request was interrupted.'));
  });
}

function validWrite(table, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => key !== 'poll' && key !== table.field)) return false;
  if (typeof value.poll !== 'string' || !POLL_ID.test(value.poll)) return false;
  if (table.field === 'choice') return value.choice === 0 || value.choice === 1;
  return typeof value.body === 'string' && value.body.trim().length > 0
    && [...value.body].length <= 100 && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value.body);
}

function selectRows(table, search) {
  const keys = new Set(['select', 'poll', 'limit', 'order']);
  for (const key of search.keys()) {
    if (!keys.has(key) || search.getAll(key).length !== 1) throw new Error('Unsupported or repeated query parameter.');
  }
  const columns = (search.get('select') ?? table.field).split(',');
  const available = new Set(['id', 'poll', table.field, 'created_at']);
  if (!(columns.length === 1 && columns[0] === '*') && columns.some((column) => !available.has(column))) {
    throw new Error('Unsupported select column.');
  }
  const rawLimit = search.get('limit') ?? (table.field === 'choice' ? '4000' : '100');
  if (!/^\d{1,4}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 4000) {
    throw new Error('limit must be between 1 and 4000.');
  }
  const rawPoll = search.get('poll');
  let rows = table.rows;
  if (rawPoll !== null) {
    if (!rawPoll.startsWith('eq.') || !POLL_ID.test(rawPoll.slice(3))) throw new Error('poll must be eq.<poll-id>.');
    rows = rows.filter((row) => row.poll === rawPoll.slice(3));
  }
  const order = search.get('order');
  if (order && !/^(created_at|id)\.(asc|desc)$/.test(order)) throw new Error('Unsupported ordering.');
  // IDs establish a stable order even when two rows share a millisecond timestamp.
  if (order?.endsWith('.desc')) rows = rows.slice().reverse();
  rows = rows.slice(0, Number(rawLimit));
  return rows.map((row) => columns[0] === '*' ? { ...row }
    : Object.fromEntries(columns.map((column) => [column, row[column]])));
}

function safePath(rawUrl) {
  let pathname;
  try { pathname = decodeURIComponent(rawUrl.split('?')[0]); }
  catch { return null; }
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0')) return null;
  if (pathname.split('/').some((part) => part.startsWith('.'))) return null;
  return pathname;
}

function allowedStatic(relative) {
  const parts = relative.split(/[\\/]/);
  if (parts.some((part) => !part || part.startsWith('.'))) return false;
  return relative === 'index.html' || relative === 'deck.html'
    || (parts[0] === 'vendor' && parts.length > 1);
}

async function serveStatic(req, res, pathname, rootReal) {
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!allowedStatic(relative)) return error(res, 404, 'Not found.');
  const target = path.resolve(ROOT, relative);
  if (!target.startsWith(ROOT + path.sep)) return error(res, 404, 'Not found.');
  try {
    const realTarget = await realpath(target);
    const realRelative = path.relative(rootReal, realTarget);
    if (!realTarget.startsWith(rootReal + path.sep) || !allowedStatic(realRelative)) {
      return error(res, 404, 'Not found.');
    }
    if (!(await stat(realTarget)).isFile()) return error(res, 404, 'Not found.');
    const body = await readFile(realTarget);
    const types = {
      '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
      '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
    };
    res.writeHead(200, { 'Content-Type': types[path.extname(realTarget).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': body.length });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (caught) {
    error(res, caught.code === 'ENOENT' || caught.code === 'ENOTDIR' ? 404 : 500, 'File is unavailable.');
  }
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/local-poll-server.mjs [--port 8749] [--lan]');
    console.log('Default: this computer only. --lan: allow devices on your local network.');
    console.log('Votes and questions exist only in memory and disappear when this server stops.');
    return;
  }
  const rootReal = await realpath(ROOT);
  const addresses = lanAddresses();
  const allowedHosts = new Set(['127.0.0.1', 'localhost', ...(args.lan ? addresses : [])]);
  const server = http.createServer(async (req, res) => {
    headers(res);
    try {
      const host = req.headers.host;
      let origin;
      try {
        if (!host || /[\s/@\\?#]/.test(host)) throw new Error();
        const parsed = new URL(`http://${host}`);
        if (!allowedHosts.has(parsed.hostname) || Number(parsed.port || 80) !== server.address().port) throw new Error();
        origin = parsed.origin;
      } catch { return error(res, 403, 'Use the local address printed by the server.'); }
      const pathname = safePath(req.url ?? '/');
      if (pathname === null) return error(res, 404, 'Not found.');
      const url = new URL(req.url, origin);
      if (pathname === '/poll-config.js' && (req.method === 'GET' || req.method === 'HEAD')) {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(req.method === 'HEAD' ? undefined : "window.IR_POLL_CONFIG={url:location.origin+'/poll-api',key:'local'};\n");
      }
      const api = /^\/poll-api\/rest\/v1\/(deck_votes|deck_questions)$/.exec(pathname);
      if (api) {
        const table = TABLES.get(api[1]);
        if (req.method === 'GET') {
          if (!consumeRate(req, res, 'read')) return;
          try { return json(res, 200, selectRows(table, url.searchParams)); }
          catch (caught) { return error(res, 400, caught.message); }
        }
        if (req.method === 'POST') {
          if (req.headers['sec-fetch-site'] === 'cross-site') return error(res, 403, 'Cross-origin writes are not allowed.');
          if (req.headers.origin !== undefined && req.headers.origin !== origin) return error(res, 403, 'Cross-origin writes are not allowed.');
          if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) return error(res, 415, 'Use Content-Type: application/json.');
          if (!consumeRate(req, res, 'write')) return;
          const value = await requestBody(req);
          if (!validWrite(table, value)) return error(res, 400, 'Invalid poll or answer.');
          if (table.rows.length >= MAX_ROWS) return error(res, 507, 'This temporary session has reached its row limit.');
          const row = { id: nextId++, poll: value.poll, [table.field]: value[table.field], created_at: new Date().toISOString() };
          table.rows.push(row);
          if ((req.headers.prefer ?? '').includes('return=representation')) return json(res, 201, [row]);
          res.writeHead(201);
          return res.end();
        }
        res.setHeader('Allow', 'GET, POST');
        return error(res, 405, 'Only GET and POST are supported.');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return error(res, 405, 'Only GET and HEAD are supported.');
      }
      return await serveStatic(req, res, pathname, rootReal);
    } catch (caught) {
      if (!res.headersSent && !res.destroyed) error(res, caught.status ?? 500, caught.status ? caught.message : 'Request could not be completed.');
      else if (!res.destroyed) res.end();
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 3_000;
  server.on('clientError', (_caught, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, args.lan ? '0.0.0.0' : '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const session = `local-${Date.now().toString(36)}`;
  console.log(`[local-poll] listening http://127.0.0.1:${port}/`);
  for (const host of ['127.0.0.1', ...(args.lan ? addresses : [])]) {
    console.log(`Audience: http://${host}:${port}/index.html?poll=${session}#voice`);
    console.log(`Presenter: http://${host}:${port}/index.html?poll=${session}#voice`);
    console.log(`기존 IR 덱(별도 질문): http://${host}:${port}/deck.html?poll=${session}-legacy`);
  }
  console.log(args.lan ? 'LAN mode: only devices able to reach this computer can join. No firewall settings were changed.' : 'Local mode: this computer only. Add --lan to allow your local network.');
  console.log('Temporary shared session: stopping or restarting the server clears ALL votes and questions. Ctrl+C to stop.');
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((caught) => {
  console.error(`[local-poll] ${caught.code === 'EADDRINUSE' ? 'Port is already in use. Choose another --port.' : caught.message}`);
  process.exitCode = 1;
});
