import test from 'node:test';
import assert from 'node:assert/strict';
import { publicationPlan } from './docker-publication.mjs';

const base = { eventName: 'push', ref: 'refs/heads/main', sha: 'a'.repeat(40), expectedSha: 'a'.repeat(40), owner: 'Example-Org' };
const release = (overrides = {}) => ({ ...base, eventName: 'release', ref: 'refs/tags/v1.2.3', release: { tag_name: 'v1.2.3', draft: false, prerelease: false }, ...overrides });

test('main publishes only main and commit tags, never latest', () => {
  const result = publicationPlan(base);
  assert.deepEqual(result.tags, [`ghcr.io/example-org/mini-qr:sha-${base.sha}`, 'ghcr.io/example-org/mini-qr:main']);
});
test('stable release publishes version, release, latest and commit tags', () => {
  const result = publicationPlan(release());
  assert.ok(result.tags.includes('ghcr.io/example-org/mini-qr:v1.2.3'));
  assert.ok(result.tags.includes('ghcr.io/example-org/mini-qr:latest'));
  assert.ok(result.tags.includes('ghcr.io/example-org/mini-qr:release'));
  assert.ok(!result.tags.includes('ghcr.io/example-org/mini-qr:main'));
});
test('prerelease never publishes latest or release aliases', () => {
  const result = publicationPlan(release({ release: { tag_name: 'v1.2.3', draft: false, prerelease: true } }));
  assert.equal(result.tags.length, 2);
  assert.ok(result.tags.every(tag => !tag.endsWith(':latest') && !tag.endsWith(':release')));
});
test('pull requests, pull_request_target, dispatch and feature pushes cannot publish', () => {
  for (const eventName of ['pull_request', 'pull_request_target', 'workflow_dispatch', 'workflow_run']) {
    assert.throws(() => publicationPlan({ ...base, eventName }), /Only main/);
  }
  assert.throws(() => publicationPlan({ ...base, ref: 'refs/heads/feature' }), /Only main/);
});
test('draft or malformed release metadata cannot publish', () => {
  for (const value of [undefined, {}, { draft: true, prerelease: false }, { draft: false, prerelease: 'false' }]) {
    assert.throws(() => publicationPlan(release({ release: value })), /Only main/);
  }
});
test('source SHA must be a full hash identical to the tested event SHA', () => {
  for (const change of [{ expectedSha: 'b'.repeat(40) }, { sha: 'main' }, { sha: '' }, { expectedSha: undefined }]) {
    assert.throws(() => publicationPlan({ ...base, ...change }), /exact tested/);
  }
});
test('invalid or reserved release tags cannot bypass alias policy', () => {
  for (const tag of ['main', 'latest', 'LATEST', 'release', 'sha-anything', 'bad/tag', 'bad\ntag', '', 'a'.repeat(129)]) {
    assert.throws(() => publicationPlan(release({ ref: `refs/tags/${tag}`, release: { tag_name: tag, draft: false, prerelease: true } })));
  }
});
test('release ref must match tag and invalid registry owner is rejected', () => {
  assert.throws(() => publicationPlan(release({ ref: 'refs/heads/main' })), /does not match/);
  assert.throws(() => publicationPlan({ ...base, owner: 'owner/other' }), /namespace/);
});
