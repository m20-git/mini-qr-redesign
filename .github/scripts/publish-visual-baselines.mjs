import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const directory = 'tests/e2e/create.spec.ts-snapshots';
export const branch = 'ci/visual-baselines';
export const paths = ['qr-no-frame-as-jpg', 'qr-no-frame', 'qr-with-frame-as-jpg', 'qr-with-frame']
  .map(name => `${directory}/${name}-chromium-linux.png`).sort();
const signature = Buffer.from('89504e470d0a1a0a', 'hex');
export function validateCandidates(files) {
  if (files.length !== 4 || JSON.stringify(files.map(f => f.path).sort()) !== JSON.stringify(paths)) {
    throw new Error('Candidates must be exactly the four allowlisted Linux PNG paths');
  }
  for (const file of files) {
    if (!Buffer.isBuffer(file.data) || file.data.length <= 8 || !file.data.subarray(0, 8).equals(signature)) {
      throw new Error(`Invalid PNG: ${file.path}`);
    }
  }
  return files;
}
export function collectCandidates() {
  const actual = readdirSync(directory).filter(name => name.endsWith('-chromium-linux.png'));
  if (actual.length !== 4) throw new Error('Expected exactly four Linux candidate files');
  return validateCandidates(paths.map(path => {
    if (!lstatSync(path).isFile()) throw new Error(`Candidate is not a regular file: ${path}`);
    const original = execFileSync('git', ['-c', `safe.directory=${process.cwd()}`, 'show', `HEAD:${path}`]);
    const data = readFileSync(path);
    return { path, data, changed: !data.equals(original) };
  }));
}
export function metadata(env) {
  const run = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  return {
    title: 'Update visual baseline images',
    body: `## Visual baseline review\n\nOnly the four allowlisted Chromium/Linux PNGs are updated.\n\nCandidate generation and two repeated comparisons succeeded. This is not design approval: inspect the image diff before merging. No automatic approval or merge.\n\nMain commit: ${env.GITHUB_SHA}\nWorkflow run: ${run}\n`
  };
}
export function githubClient(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required');
  const base = `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}`;
  return async (method, path, body, optional = false) => {
    const response = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}
export async function publish(files, env, api) {
  validateCandidates(files);
  if (!files.some(file => file.changed)) return { status: 'unchanged' };
  const source = env.GITHUB_SHA;
  const main = await api('GET', '/git/ref/heads/main');
  if (main.object.sha !== source) return { status: 'stale-main' };
  const commit = await api('GET', `/git/commits/${source}`);
  const tree = [];
  for (const file of files) {
    const blob = await api('POST', '/git/blobs', { content: file.data.toString('base64'), encoding: 'base64' });
    const expected = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${file.data.length}\0`), file.data])).digest('hex');
    if (blob.sha !== expected) throw new Error('Uploaded blob hash mismatch');
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const candidate = await api('POST', '/git/trees', { base_tree: commit.tree.sha, tree });
  const oldRef = await api('GET', `/git/ref/heads/${branch}`, undefined, true);
  const oldCommit = oldRef ? await api('GET', `/git/commits/${oldRef.object.sha}`) : null;
  let sha = oldRef?.object.sha;
  if (oldCommit?.tree.sha !== candidate.sha || oldCommit?.parents?.[0]?.sha !== source) {
    const next = await api('POST', '/git/commits', {
      message: `Update visual baseline images for ${source.slice(0, 12)}`,
      tree: candidate.sha, parents: [source]
    });
    const latest = await api('GET', '/git/ref/heads/main');
    if (latest.object.sha !== source) return { status: 'stale-main' };
    sha = next.sha;
    if (oldRef) await api('PATCH', `/git/refs/heads/${branch}`, { sha, force: true });
    else await api('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha });
  }
  const head = `${env.GITHUB_REPOSITORY.split('/')[0]}:${branch}`;
  const prs = await api('GET', `/pulls?state=open&base=main&head=${encodeURIComponent(head)}`);
  if (prs.length > 1) throw new Error('More than one open baseline PR');
  const details = metadata(env);
  const pr = prs.length
    ? await api('PATCH', `/pulls/${prs[0].number}`, details)
    : await api('POST', '/pulls', { ...details, head: branch, base: 'main' });
  return { status: prs.length ? 'updated' : 'created', url: pr.html_url, sha };
}
async function main() {
  const files = collectCandidates();
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ dryRun: true, branch, changed: files.filter(f => f.changed).map(f => f.path), ...metadata(process.env) }, null, 2));
    return;
  }
  const env = process.env;
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_ACTOR === 'github-actions[bot]') {
    throw new Error('Publishing is restricted to trusted pushes to main');
  }
  console.log(JSON.stringify(await publish(files, env, githubClient(env)), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
