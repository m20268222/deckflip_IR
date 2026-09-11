import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { access, copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

// Black-box integration checks. All traffic is raw HTTP to a fresh loopback
// process. Static pages are fetched as bytes; their scripts are never executed.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = resolve(root, 'tools/local-poll-server.mjs');
const votes = '/poll-api/rest/v1/deck_votes';
const questions = '/poll-api/rest/v1/deck_questions';

async function launch(t, extra = [], fixtureRoot = root) {
  const entry = resolve(fixtureRoot, 'tools/local-poll-server.mjs');
  await access(entry);
  const child = spawn(process.execPath, [entry, '--port', '0', ...extra], {
    cwd: fixtureRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  let stopped = false;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  async function stop() {
    if (stopped) return;
    stopped = true;
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  }
  t.after(stop);
  const base = await new Promise((resolveBase, reject) => {
    const timer = setTimeout(() => reject(new Error(`No listening URL within 10s: ${output}`)), 10_000);
    const finish = (error, value) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolveBase(value);
    };
    const append = (chunk) => {
      output += chunk.toString('utf8');
      const match = output.match(/http:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):(\d+)/);
      if (match && Number(match[1]) > 0) finish(null, `http://127.0.0.1:${match[1]}`);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', (error) => finish(error));
    child.once('exit', (code) => finish(new Error(`Server exited ${code}: ${output}`)));
  });
  return { base, stop };
}

function http(base, path, { method = 'GET', headers = {}, body } = {}) {
  const destination = new URL(base);
  assert.equal(destination.hostname, '127.0.0.1', 'Tests may only contact loopback');
  assert.ok(path.startsWith('/'), 'Request paths must remain relative');
  return new Promise((resolveResponse, reject) => {
    const req = request({
      hostname: destination.hostname,
      port: destination.port,
      path,
      method,
      headers,
      timeout: 5000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.once('error', reject);
      res.once('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolveResponse({ status: res.statusCode, headers: res.headers, text,
          json: () => JSON.parse(text) });
      });
    });
    req.once('error', reject);
    req.once('timeout', () => req.destroy(new Error('Loopback request timed out')));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function post(base, table, payload, headers = {}) {
  return http(base, table, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, ...headers },
    body: JSON.stringify(payload),
  });
}

async function rows(base, table, query) {
  const response = await http(base, `${table}?${query}`);
  assert.equal(response.status, 200, response.text);
  const result = response.json();
  assert.ok(Array.isArray(result), 'GET must return a JSON array');
  return result;
}

function rejected(response, label) {
  assert.ok(response.status >= 400 && response.status < 500,
    `${label}: expected a client rejection, got ${response.status} ${response.text.slice(0, 160)}`);
}

test('static entry points and generated config are available without running page scripts', async (t) => {
  const { base } = await launch(t);
  for (const path of ['/', '/index.html', '/deck.html']) {
    const response = await http(base, path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers['content-type'] || '', /text\/html/i);
    assert.match(response.text, /<html\b/i);
    assert.match(response.headers['content-security-policy'] || '', /connect-src\s+'self'(?:;|$)/i);
  }
  const response = await http(base, '/poll-config.js');
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'] || '', /(?:java|ecma)script/i);
  const context = { window: {}, location: { origin: base } };
  runInNewContext(response.text, context, { timeout: 1000 });
  assert.equal(context.window.IR_POLL_CONFIG.url, `${base}/poll-api`);
  assert.equal(context.window.IR_POLL_CONFIG.key, 'local');
});

test('votes are shared inside one process and isolated by poll id', async (t) => {
  const { base } = await launch(t);
  assert.deepEqual(await rows(base, votes, 'select=choice&poll=eq.alpha&limit=4000'), []);
  for (const payload of [{ poll: 'alpha', choice: 0 }, { poll: 'alpha', choice: 1 }, { poll: 'beta', choice: 1 }]) {
    const response = await post(base, votes, payload);
    assert.equal(response.status, 201, response.text);
  }
  assert.deepEqual(await rows(base, votes, 'select=choice&poll=eq.alpha&limit=4000'), [{ choice: 0 }, { choice: 1 }]);
  assert.deepEqual(await rows(base, votes, 'select=choice&poll=eq.beta&limit=4000'), [{ choice: 1 }]);
  assert.equal((await rows(base, votes, 'select=choice&limit=4000')).length, 3);
  assert.equal((await rows(base, votes, 'select=choice&poll=eq.alpha&limit=1')).length, 1);
  assert.deepEqual(await rows(base, votes, 'select=choice&poll=eq.unseen&limit=4000'), []);
});

test('questions preserve Unicode, sort newest first and enforce the result limit', async (t) => {
  const { base } = await launch(t);
  const first = '첫 질문 <script>alert(1)</script>';
  const second = '두 번째 질문 😀';
  for (const body of [first, second]) {
    const response = await post(base, questions, { poll: 'qa_1-A', body });
    assert.equal(response.status, 201, response.text);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
  }
  assert.equal((await post(base, questions, { poll: 'qa_other', body: '다른 발표' })).status, 201);
  assert.deepEqual(await rows(base, questions, 'select=body&poll=eq.qa_1-A&order=created_at.desc&limit=100'),
    [{ body: second }, { body: first }]);
  assert.deepEqual(await rows(base, questions, 'select=body&poll=eq.qa_1-A&order=created_at.desc&limit=1'), [{ body: second }]);
  assert.equal((await rows(base, questions, 'select=body&order=created_at.desc&limit=100')).length, 3);
  assert.equal((await post(base, questions, { poll: 'unicode', body: '😀'.repeat(100) })).status, 201);
  rejected(await post(base, questions, { poll: 'unicode', body: '😀'.repeat(101) }), '101 Unicode code points');
});

test('invalid records and malformed JSON never enter the store', async (t) => {
  const { base } = await launch(t);
  const invalid = [
    null, [], 'wrong', {}, { poll: 'validation' },
    ...[-1, 2, 0.5, '0', true, null].map((choice) => ({ poll: 'validation', choice })),
    ...['', 'a'.repeat(81), '../escape', 'space here', '한글'].map((poll) => ({ poll, choice: 0 })),
  ];
  for (const payload of invalid) rejected(await post(base, votes, payload), JSON.stringify(payload));
  for (const body of ['', 'x'.repeat(101), 1, null, []]) {
    rejected(await post(base, questions, { poll: 'validation', body }), `Invalid question ${JSON.stringify(body)}`);
  }
  rejected(await http(base, votes, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: '{' }), 'Malformed JSON');
  const oversized = JSON.stringify({ poll: 'validation', choice: 0, padding: '😀'.repeat(1100) });
  assert.ok(Buffer.byteLength(oversized, 'utf8') > 4096);
  const tooLarge = await http(base, votes, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: oversized });
  assert.equal(tooLarge.status, 413, `Valid JSON over the byte limit: ${tooLarge.text}`);
  assert.deepEqual(await rows(base, votes, 'select=choice&poll=eq.validation&limit=4000'), []);
  assert.deepEqual(await rows(base, questions, 'select=body&poll=eq.validation&order=created_at.desc&limit=100'), []);
  assert.equal((await post(base, votes, { poll: 'a'.repeat(80), choice: 0 })).status, 201);
});

test('invalid filters and unsupported write verbs are rejected', async (t) => {
  const { base } = await launch(t);
  for (const query of [
    'select=choice&poll=eq.', 'select=choice&poll=eq.bad%2Fid',
    'select=choice&poll=like.alpha', 'select=choice&limit=-1',
    'select=choice&limit=4001', 'select=choice&limit=NaN',
  ]) rejected(await http(base, `${votes}?${query}`), query);
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    rejected(await http(base, votes, { method, headers: { Origin: base } }), method);
  }
});

test('cross-origin and non-JSON writes are rejected without permissive CORS', async (t) => {
  const { base } = await launch(t);
  for (const Origin of ['https://example.invalid', 'null', 'http://127.0.0.1:1', base.replace('http:', 'https:')]) {
    const response = await post(base, votes, { poll: 'origin', choice: 0 }, { Origin });
    rejected(response, `Origin ${Origin}`);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
  for (const headers of [{}, { 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/x-www-form-urlencoded' }]) {
    rejected(await http(base, votes, { method: 'POST', headers: { Origin: base, ...headers }, body: '{"poll":"origin","choice":0}' }), 'Non-JSON request');
  }
  const preflight = await http(base, votes, { method: 'OPTIONS', headers: { Origin: 'https://example.invalid', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(preflight.headers['access-control-allow-origin'], undefined);
  const accepted = await post(base, votes, { poll: 'origin', choice: 1 }, { 'Content-Type': 'application/json; charset=utf-8' });
  assert.equal(accepted.status, 201, accepted.text);
  assert.equal(accepted.headers['access-control-allow-origin'], undefined);
  assert.deepEqual(await rows(base, votes, 'select=choice&poll=eq.origin&limit=4000'), [{ choice: 1 }]);
});

test('only the static allowlist is served and raw traversal paths stay denied', async (t) => {
  const { base } = await launch(t);
  for (const path of [
    '/.git/config', '/.github/workflows/deploy.yml', '/supabase/',
    '/tools/local-poll-server.mjs', '/tests/local-poll-server.test.mjs', '/package.json',
    '/../index.html', '/%2e%2e/index.html', '/vendor/../index.html',
    '/vendor/%2e%2e/index.html', '/vendor/%2E%2E%2findex.html',
    '/vendor/..%5cindex.html', '/vendor/%252e%252e/index.html',
    '/vendor/.secret', '/vendor/%2egit/config', '/index.html%00',
  ]) rejected(await http(base, path), path);
});

test('vendor assets work while a junction out of the served root stays denied', async (t) => {
  // The isolated fixture is outside the repository and includes only this server
  // plus harmless marker files authored by this test. A Windows junction does
  // not require the elevated permission needed for a file symbolic link.
  const fixture = await mkdtemp(resolve(tmpdir(), 'local-poll-security-'));
  const served = resolve(fixture, 'served');
  const outside = resolve(fixture, 'outside');
  let server;
  t.after(async () => {
    await server?.stop();
    const allowedTemp = resolve(tmpdir());
    assert.ok(fixture.startsWith(`${allowedTemp}\\`) || fixture.startsWith(`${allowedTemp}/`));
    assert.ok(fixture.slice(allowedTemp.length + 1).startsWith('local-poll-security-'));
    await rm(fixture, { recursive: true, force: true });
  });
  await mkdir(resolve(served, 'tools'), { recursive: true });
  await mkdir(resolve(served, 'vendor'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await copyFile(serverPath, resolve(served, 'tools/local-poll-server.mjs'));
  await writeFile(resolve(served, 'index.html'), '<html><body>fixture</body></html>');
  await writeFile(resolve(served, 'deck.html'), '<html><body>fixture deck</body></html>');
  await writeFile(resolve(served, 'vendor/fixture.js'), 'window.fixture = true;');
  await writeFile(resolve(outside, 'secret.txt'), 'PRIVATE_FIXTURE_MUST_NOT_BE_SERVED');
  await symlink(outside, resolve(served, 'vendor/escape'), process.platform === 'win32' ? 'junction' : 'dir');
  server = await launch(t, [], served);
  const good = await http(server.base, '/vendor/fixture.js');
  assert.equal(good.status, 200);
  assert.equal(good.text, 'window.fixture = true;');
  const escaped = await http(server.base, '/vendor/escape/secret.txt');
  rejected(escaped, 'Junction outside static root');
  assert.ok(!escaped.text.includes('PRIVATE_FIXTURE_MUST_NOT_BE_SERVED'));
});

test('process restart clears all local votes and questions', async (t) => {
  const first = await launch(t);
  assert.equal((await post(first.base, votes, { poll: 'restart', choice: 0 })).status, 201);
  assert.equal((await post(first.base, questions, { poll: 'restart', body: 'temporary' })).status, 201);
  await first.stop();
  const second = await launch(t);
  assert.deepEqual(await rows(second.base, votes, 'select=choice&poll=eq.restart&limit=4000'), []);
  assert.deepEqual(await rows(second.base, questions, 'select=body&poll=eq.restart&order=created_at.desc&limit=100'), []);
});

test('--lan explicitly starts a reachable process on an ephemeral port', async (t) => {
  const { base } = await launch(t, ['--lan']);
  assert.equal((await http(base, '/poll-config.js')).status, 200);
});

test('a final request burst hits a bounded per-IP rate cap', async (t) => {
  const { base } = await launch(t);
  let limited;
  for (let attempt = 0; attempt < 512; attempt += 1) {
    const response = await post(base, votes, { poll: 'rate', choice: attempt % 2 });
    if (response.status === 429) { limited = response; break; }
    assert.equal(response.status, 201, response.text);
  }
  assert.ok(limited, 'Expected the modest per-IP cap to return 429 within 512 immediate writes');
  assert.ok(Number(limited.headers['retry-after']) > 0, 'Rate limit must explain when to retry');
});
