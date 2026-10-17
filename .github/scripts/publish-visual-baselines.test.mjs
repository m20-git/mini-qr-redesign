import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { branch, directory, paths, validateCandidates, metadata, githubClient, publish } from './publish-visual-baselines.mjs';
const env = { GITHUB_SHA: 'a'.repeat(40), GITHUB_REPOSITORY: 'owner/repo', GITHUB_SERVER_URL: 'https://github.com', GITHUB_RUN_ID: '123' };
const files = () => paths.map(path => ({ path, data: Buffer.from('89504e470d0a1a0a00', 'hex'), changed: true }));
function mock({ existing = false, stale = false, lateStale = false, idempotent = false, fail = false } = {}) {
  const calls = [];
  let mainReads = 0;
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (fail) throw new Error('HTTP 403');
    if (path === '/git/ref/heads/main') return { object: { sha: stale || (lateStale && ++mainReads > 1) ? 'new-main' : env.GITHUB_SHA } };
    if (path === `/git/commits/${env.GITHUB_SHA}`) return { tree: { sha: 'base-tree' } };
    if (path === '/git/blobs') {
      const data = Buffer.from(body.content, 'base64');
      return { sha: createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${data.length}\0`), data])).digest('hex') };
    }
    if (path === '/git/trees') return { sha: 'new-tree' };
    if (path === `/git/ref/heads/${branch}`) return existing ? { object: { sha: 'old-tip' } } : null;
    if (path === '/git/commits/old-tip') return { tree: { sha: idempotent ? 'new-tree' : 'old-tree' }, parents: [{ sha: env.GITHUB_SHA }] };
    if (path === '/git/commits') return { sha: 'new-tip' };
    if (path.startsWith('/git/refs')) return {};
    if (method === 'GET' && path.startsWith('/pulls?')) return existing ? [{ number: 7 }] : [];
    if (path === '/pulls' || path === '/pulls/7') return { html_url: 'https://github.com/owner/repo/pull/7' };
    throw new Error(`Unexpected API call: ${method} ${path}`);
  };
  return { api, calls };
}
test('rejects missing, extra, duplicate and non-allowlisted files', () => {
  for (const input of [files().slice(1), [...files(), files()[0]], [files()[0], ...files().slice(0, 3)], files().map((f, i) => i ? f : { ...f, path: 'app.js' })]) {
    assert.throws(() => validateCandidates(input), /exactly/);
  }
});
test('rejects non-PNG data', () => {
  assert.throws(() => validateCandidates(files().map(f => ({ ...f, data: Buffer.from('not png') }))), /Invalid PNG/);
});
test('metadata interpolates source SHA and workflow URL', () => {
  const body = metadata(env).body;
  assert.ok(body.includes(env.GITHUB_SHA));
  assert.ok(body.includes('https://github.com/owner/repo/actions/runs/123'));
  assert.ok(!body.includes('$GITHUB'));
});
test('client requires explicit token', () => assert.throws(() => githubClient(env), /TOKEN/));
test('unchanged candidates cause zero API calls', async () => {
  const { api, calls } = mock();
  assert.equal((await publish(files().map(f => ({ ...f, changed: false })), env, api)).status, 'unchanged');
  assert.equal(calls.length, 0);
});
test('stale main causes no writes', async () => {
  const { api, calls } = mock({ stale: true });
  assert.equal((await publish(files(), env, api)).status, 'stale-main');
  assert.ok(calls.every(c => c.method === 'GET'));
});
test('creates stable branch and PR from main with exactly four allowlisted tree entries', async () => {
  const { api, calls } = mock();
  assert.equal((await publish(files(), env, api)).status, 'created');
  assert.deepEqual(calls.find(c => c.path === '/git/trees').body.tree.map(f => f.path).sort(), paths);
  assert.equal(calls.find(c => c.path === '/git/trees').body.base_tree, 'base-tree');
  assert.deepEqual(calls.find(c => c.path === '/git/commits').body.parents, [env.GITHUB_SHA]);
  assert.equal(calls.find(c => c.path === '/git/refs').body.ref, `refs/heads/${branch}`);
  assert.equal(calls.find(c => c.path === '/pulls').body.head, branch);
});
test('updates existing stable branch and PR instead of opening another', async () => {
  const { api, calls } = mock({ existing: true });
  assert.equal((await publish(files(), env, api)).status, 'updated');
  assert.ok(calls.some(c => c.method === 'PATCH' && c.path === `/git/refs/heads/${branch}`));
  assert.ok(calls.some(c => c.method === 'PATCH' && c.path === '/pulls/7'));
  assert.ok(!calls.some(c => c.method === 'POST' && c.path === '/pulls'));
});
test('same source and tree do not create another commit or move branch', async () => {
  const { api, calls } = mock({ existing: true, idempotent: true });
  await publish(files(), env, api);
  assert.ok(!calls.some(c => c.path === '/git/commits' || c.path.startsWith('/git/refs')));
});
test('main advancing during preparation prevents branch and PR writes', async () => {
  const { api, calls } = mock({ lateStale: true });
  assert.equal((await publish(files(), env, api)).status, 'stale-main');
  assert.ok(!calls.some(c => c.path.startsWith('/git/refs') || c.path.startsWith('/pulls')));
});
test('API failure propagates rather than reporting success', async () => {
  await assert.rejects(publish(files(), env, mock({ fail: true }).api), /403/);
});
test('CLI dry run needs no token and detects candidates in a real temporary git repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'baseline-test-'));
  try {
    mkdirSync(join(root, directory), { recursive: true });
    for (const file of files()) writeFileSync(join(root, file.path), file.data);
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init'); git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
    writeFileSync(join(root, paths[0]), Buffer.concat([files()[0].data, Buffer.from('changed')]));
    const script = new URL('./publish-visual-baselines.mjs', import.meta.url);
    const output = execFileSync(process.execPath, [script.pathname, '--dry-run'], { cwd: root, env: { ...process.env, ...env, GITHUB_TOKEN: '' }, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output).changed, [paths[0]]);
    assert.throws(() => execFileSync(process.execPath, [script.pathname], { cwd: root, env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request' }, stdio: 'pipe' }));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
