import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(testDir);
const htmlNames = ['index.html', 'deck.html'];
const failures = [];
const passes = [];

function check(condition, message) {
  if (condition) passes.push(message);
  else failures.push(message);
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function unique(values) {
  return [...new Set(values)];
}

function extractSupabaseUrls(source) {
  return unique(
    source.match(/https:\/\/[a-z0-9-]+\.supabase\.co\b/gi) ?? [],
  ).map((url) => url.toLowerCase().replace(/\/$/, ''));
}

function extractClientKeys(source) {
  const jwtKeys = source.match(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g) ?? [];
  const modernKeys = source.match(/\bsb_(?:publishable|anon)_[A-Za-z0-9_-]+\b/g) ?? [];
  return unique([...jwtKeys, ...modernKeys]);
}

function decodeJwtPayload(jwt) {
  try {
    const payload = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isPublicClientKey(key) {
  if (/^sb_(?:publishable|anon)_/.test(key)) return true;
  const payload = decodeJwtPayload(key);
  return payload?.role === 'anon' && payload?.iss === 'supabase';
}

function inlineScripts(html) {
  const scripts = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const attributes = match[1];
    const body = match[2];
    const typeMatch = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch?.[1]?.toLowerCase();
    const isJavaScript = !type || type === 'text/javascript' || type === 'application/javascript';
    if (isJavaScript && body.trim()) scripts.push(body);
  }
  return scripts;
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(target));
    else files.push(target);
  }
  return files;
}

function hasPolicy(sql, table, operation) {
  const statements = sql.match(/create\s+policy\b[\s\S]*?;/gi) ?? [];
  return statements.some((statement) => {
    const targetsTable = new RegExp(`\\bon\\s+(?:public\\.)?${table}\\b`, 'i').test(statement);
    const targetsOperation = new RegExp(`\\bfor\\s+${operation}\\b`, 'i').test(statement);
    const permitsPublicClient = /\bto\s+(?:anon|public)\b/i.test(statement);
    return targetsTable && targetsOperation && permitsPublicClient;
  });
}

const htmlByName = Object.fromEntries(
  htmlNames.map((name) => [name, readRepoFile(name)]),
);

for (const name of htmlNames) {
  const html = htmlByName[name];
  const urls = extractSupabaseUrls(html);
  const keys = extractClientKeys(html);

  check(urls.length === 1, `${name}: Supabase project URL is unique`);
  check(keys.length === 1, `${name}: Supabase client key is unique`);
  check(keys.length === 1 && isPublicClientKey(keys[0]), `${name}: only a public anon/publishable key is embedded`);
  check(!/\bservice[_-]?role\b|\bsb_secret_[A-Za-z0-9_-]+\b|\bSUPABASE_(?:SERVICE_ROLE|SECRET)(?:_KEY)?\b/i.test(html), `${name}: no service-role or secret key marker is present`);
  check(/new\s+URLSearchParams\s*\(\s*location\.search\s*\)\s*\.get\s*\(\s*['"]poll['"]\s*\)/.test(html), `${name}: ?poll= query override is supported`);
  check(/\/rest\/v1\//.test(html), `${name}: Supabase REST endpoint is used`);

  const scripts = inlineScripts(html);
  check(scripts.length > 0, `${name}: inline JavaScript blocks were found`);
  scripts.forEach((script, index) => {
    try {
      new vm.Script(script, { filename: `${name}:inline-script-${index + 1}` });
      passes.push(`${name}: inline script ${index + 1} parses`);
    } catch (error) {
      failures.push(`${name}: inline script ${index + 1} has a syntax error (${error.message})`);
    }
  });
}

const indexUrls = extractSupabaseUrls(htmlByName['index.html']);
const deckUrls = extractSupabaseUrls(htmlByName['deck.html']);
const indexKeys = extractClientKeys(htmlByName['index.html']);
const deckKeys = extractClientKeys(htmlByName['deck.html']);
check(indexUrls.length === 1 && deckUrls.length === 1 && indexUrls[0] === deckUrls[0], 'index.html and deck.html use the same Supabase URL');
check(indexKeys.length === 1 && deckKeys.length === 1 && indexKeys[0] === deckKeys[0], 'index.html and deck.html use the same public client key');

check(/\/rest\/v1\/deck_votes\b/.test(htmlByName['index.html']), 'index.html reads and writes deck_votes');
check(!/counts\s*=\s*\[4\s*,\s*11\]/.test(htmlByName['index.html']), 'index.html does not invent fallback vote totals');
check(/encodeURIComponent\s*\(\s*pid\(\)\s*\)/.test(htmlByName['index.html']), 'index.html safely encodes its poll id');
check(/\.then\s*\(\s*function\s*\(r\)\s*\{\s*if\s*\(\s*!r\.ok\s*\)\s*throw/.test(htmlByName['index.html']), 'index.html checks the vote POST response');
check(/투표가 전송되지 않았어요/.test(htmlByName['index.html']), 'index.html shows a clear vote-send failure');
check(/\btable\s*:\s*['"]deck_votes['"]/.test(htmlByName['deck.html']), 'deck.html configures deck_votes');
check(/\bqtable\s*:\s*['"]deck_questions['"]/.test(htmlByName['deck.html']), 'deck.html configures deck_questions');

const sqlFiles = listFiles(repoRoot).filter((file) => file.toLowerCase().endsWith('.sql'));
const relevantSqlFiles = sqlFiles.filter((file) => /\bdeck_(?:votes|questions)\b/i.test(fs.readFileSync(file, 'utf8')));

if (relevantSqlFiles.length > 0) {
  const sql = relevantSqlFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const table of ['deck_votes', 'deck_questions']) {
    check(new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:public\\.)?${table}\\b`, 'i').test(sql), `SQL: creates ${table}`);
    check(new RegExp(`alter\\s+table(?:\\s+if\\s+exists)?\\s+(?:public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(sql), `SQL: enables RLS on ${table}`);
    check(hasPolicy(sql, table, 'select'), `SQL: public client SELECT policy exists for ${table}`);
    check(hasPolicy(sql, table, 'insert'), `SQL: public client INSERT policy exists for ${table}`);
  }
  check(!/create\s+policy\b[\s\S]*?\bon\s+(?:public\.)?deck_(?:votes|questions)\b[\s\S]*?\bfor\s+(?:update|delete)\b[\s\S]*?\bto\s+(?:anon|public)\b[\s\S]*?;/i.test(sql), 'SQL: public clients have no UPDATE or DELETE policy');
  passes.push(`SQL: checked ${relevantSqlFiles.length} poll schema file(s)`);
} else {
  passes.push('SQL: no poll schema file is present; schema checks skipped');
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} check(s) failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${passes.length} static checks passed`);
  for (const message of passes) console.log(`  - ${message}`);
}
