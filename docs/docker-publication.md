# Docker publication policy

The Tests workflow is the single entry point for PRs, main pushes and published releases. Docker is a reusable workflow called from it. This avoids running the functional suite twice merely to gate publication.

## Events and tags

| Event | Image build/publication | Tags |
| --- | --- | --- |
| Pull request, including same-repository PRs and forks | Multi-architecture build only; no registry login or push | None |
| Push to main after all three quality jobs succeed | Publish | main and sha-<full-commit> |
| Published stable release after all three quality jobs succeed | Publish | release tag, release, latest and sha-<full-commit> |
| Published prerelease after all three quality jobs succeed | Publish | release tag and sha-<full-commit>; never latest or release |
| Manual Tests dispatch | Tests only | None |

The three quality jobs remain Unit & Browser Tests, E2E Tests (including repeated export checks) and Production build. Publication has a needs dependency on all three and is skipped if any fails or is cancelled. All checkouts explicitly use the same event SHA; Docker verifies its checkout matches that SHA. Existing functional check names remain; Docker check names change to the new reusable-job names. Update repository-required Docker check selections if configured.

The PR Docker build runs in parallel with tests, but receives only contents: read. No registry credentials or registry-cache writes are used in that job. Only the trusted publication caller and publication job request packages: write. No personal token or secrets: inherit is introduced.

Publication is serialized separately for main and release aliases. The caller also cancels superseded runs for the same event/ref. An intentionally rerun older stable release can repoint latest; latest means the last successfully published stable-release run, not a semver ordering guarantee. A delayed older main run is likewise not an atomic latest-main guarantee.

## Compatibility change

Main pushes no longer update latest. Deployments that intentionally follow main should use the main tag. Deployments following stable releases can keep latest or pin an explicit version/digest. Existing tags are not deleted by this change; latest will change on the next successful stable-release publication.

Release tags must be valid Docker tags, exactly match the release ref, and not collide with reserved main/latest/release/sha-* names. Tags are not silently rewritten. Release tags must contain these workflow files for the release trigger and policy to be available.

## Validation

Run `node --test .github/scripts/docker-publication.test.mjs`. The Unit & Browser Tests job also runs these dependency-free policy tests. They cover main, stable and prerelease tags, denied PR/manual/feature events, exact SHA matching and invalid/reserved release metadata.

Before merging, inspect the PR Docker job: both architectures must build, no login action must run, and no image must be pushed. After merging, verify Tests succeed before publication starts and only main/sha tags are produced. Verify stable-release and prerelease publication during a real release; unit tests alone do not prove registry permissions or successful image pushes. No release is created merely to test this change.

The Dockerfile, package-manager choice, BuildKit workaround, application code, installers and visual-baseline process are unchanged. Reproducible dependency installation is a separate follow-up: testing the same source SHA does not yet guarantee identical resolved npm and pnpm dependencies.
