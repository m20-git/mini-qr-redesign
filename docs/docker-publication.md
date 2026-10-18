# Docker publication policy

The Tests workflow is the single entry point for PRs, main pushes and published releases. It calls two separate reusable workflows: docker.yml for the read-only PR build and docker-publish.yml for trusted publication. The functional suite is not duplicated merely to gate publication.

## Workflow permission boundary

The PR build workflow contains no publishing job and requests only contents: read. Its caller also grants only contents: read. It does not log in, push images or write registry caches.

The separate publication caller grants contents: read and packages: write to docker-publish.yml. It has needs: [test, e2e, build] and runs only for main pushes or published, non-draft releases. A failed or cancelled prerequisite prevents publication. Neither workflow inherits secrets or introduces a personal token.

Do not put a packages: write job back into the PR reusable workflow, even behind an if condition: permission validation can reject the entire caller before skipped jobs are evaluated. Do not work around that by granting registry write access to PR builds.

## Events and tags

| Event | Build/publication | Tags |
| --- | --- | --- |
| Pull request, including same-repository PRs and forks | ARM64/AMD64 build only | None |
| Main push after successful quality gates | Publish | main and sha-<full-commit> |
| Published stable release after successful quality gates | Publish | version, release, latest and sha-<full-commit> |
| Published prerelease after successful quality gates | Publish | version and sha-<full-commit>; never latest or release |
| Manual Tests dispatch | Tests only | None |

Unit & Browser Tests, E2E Tests (including repeated exports) and Production build keep their names. All checkouts explicitly use the same event SHA; Docker verifies the checked-out commit matches it. Docker check names use the reusable-job names. Update required Docker check selections if configured.

## Compatibility and limits

Main no longer updates latest. Deployments following main should use main; stable deployments can use latest or pin a version/digest. Existing tags are not deleted. The next successful stable-release publication updates latest.

Release tags must be valid Docker tags, match the release ref and not collide with main/latest/release/sha-* names. They are not silently rewritten. Release tags must contain these workflow files for the release trigger and policy to be available.

Publication is serialized separately for main and release aliases. The caller cancels superseded runs for the same event/ref. Rerunning an older stable release can repoint latest: it denotes the last successfully published stable-release run, not guaranteed semantic-version order. A delayed older main run is likewise not an atomic latest-main guarantee.

The Dockerfile, package manager, BuildKit workaround, application code, installers and visual-baseline process are unchanged. Reproducible dependency installation remains a separate follow-up: matching source SHAs alone does not guarantee matching npm/pnpm dependency resolutions.

## Validation

Run `node --test .github/scripts/docker-*.test.mjs`. CI runs the existing eight tag/event-policy tests and four additional workflow-boundary regression tests. The latter assert read-only PR permissions, reject even a hypothetical skipped write job, check separate caller targets and preserve the publication gate. These targeted source assertions do not replace GitHub Actions validation.

Before merge, confirm that Unit & Browser Tests, E2E Tests, Production build and the PR Docker build all actually run and pass. A green visual workflow alone is insufficient. Inspect the PR Docker job for absence of registry login and push.

After merge, verify publication starts only after all three quality jobs succeed and produces main/sha tags only. Verify stable-release and prerelease publication during real releases. Local tests do not prove registry permissions or successful image pushes. Do not create a release merely to test this correction.
