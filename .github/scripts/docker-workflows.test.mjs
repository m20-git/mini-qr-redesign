import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../workflows/${name}`, import.meta.url), 'utf8');
const check = read('docker.yml');
const publish = read('docker-publish.yml');
const caller = read('test.yml');
function job(text, name) {
  const start = text.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `Missing job ${name}`);
  const rest = text.slice(start + 1);
  const next = rest.slice(1).search(/^  [a-zA-Z][\w-]*:\s*$/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
function assertReadOnly(text) {
  assert.doesNotMatch(text, /:\s*write\b/);
  assert.doesNotMatch(text, /login-action|password:|secrets:|cache-to:|push:\s*true/);
  assert.match(text, /push:\s*false/);
}
test('PR reusable workflow has no write permissions, credentials or publishing job', () => {
  assertReadOnly(check);
  assert.doesNotMatch(check, /^  publish:\s*$/m);
  assert.match(check, /if: github\.event_name == 'pull_request'/);
  assert.match(check, /ref: \$\{\{ inputs\.source_sha \}\}/);
});
test('read-only boundary detects a write permission even in a skipped nested job', () => {
  assert.throws(() => assertReadOnly(check + '\n  forbidden:\n    if: false\n    permissions:\n      packages: write\n'));
});
test('caller separates read-only PR call from quality-gated publication call', () => {
  const pr = job(caller, 'docker-check');
  assert.match(pr, /uses: \.\/\.github\/workflows\/docker\.yml/);
  assert.match(pr, /contents: read/);
  assert.doesNotMatch(pr, /:\s*write\b|secrets:/);
  const publication = job(caller, 'docker-publish');
  assert.match(publication, /needs: \[test, e2e, build\]/);
  assert.match(publication, /uses: \.\/\.github\/workflows\/docker-publish\.yml/);
  assert.match(publication, /packages: write/);
  assert.match(publication, /github\.ref == 'refs\/heads\/main'/);
  assert.match(publication, /github\.event\.action == 'published'/);
  assert.doesNotMatch(publication, /always\(\)|continue-on-error|secrets:/);
  for (const block of [pr, publication]) assert.match(block, /source_sha: \$\{\{ github\.sha \}\}/);
  assert.match(caller, /node --test \.github\/scripts\/docker-\*\.test\.mjs/);
});
test('publication workflow retains trusted-event guard, explicit policy and exact-source checks', () => {
  assert.match(publish, /packages: write/);
  assert.match(publish, /github\.ref == 'refs\/heads\/main'/);
  assert.match(publish, /github\.event\.action == 'published'/);
  assert.doesNotMatch(publish, /pull_request|inputs\.publish/);
  assert.match(publish, /run: node \.github\/scripts\/docker-publication\.mjs/);
  assert.match(publish, /test "\$SOURCE_SHA" = "\$GITHUB_SHA"/);
  assert.match(publish, /push: true/);
});
