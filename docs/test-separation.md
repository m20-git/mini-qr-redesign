# Functional and visual test separation (steps 1-9)

Steps 1-6 started at main commit 00984dfca0a3451826734a7637f8796d446d82e3 on ci/separate-functional-and-visual-tests.
Steps 7-9 and their corrections are on ci/automate-visual-baseline-prs (PR #2).
These implementation changes do not alter application code, Proxmox installers or baseline PNGs.

## Functional acceptance

`pnpm test:e2e` uses playwright.config.ts and tests/e2e only. The four export cases check downloaded PNG/JPEG files with sharp, explicit 400px QR dimensions, SVG/raster proportions for framed output, frame background pixels and QR payload round-trips through the actual scanner. SVG vector and unsafe-URL tests remain. Preview screenshots are not part of functional acceptance.

The Tests workflow runs unit/browser tests, all functional E2E tests, two additional repetitions of the four export cases without retries, and a production build. Functional failures are not suppressed. Existing functional job names are retained.

## Visual acceptance

`pnpm exec playwright test --config=playwright.visual.config.ts --update-snapshots=none`

Four preview comparisons live in tests/visual/export.visual.spec.ts. Snapshot paths retain tests/e2e/create.spec.ts-snapshots and existing PNG filenames. The 1% pixel tolerance is unchanged. Viewport, scale, locale, timezone, color mode and reduced motion are explicit. Each case gets clean browser storage with service workers blocked. Helpers wait for QR updates, fonts, images and a stable preview instead of a fixed screenshot delay.

Both visual workflows use mcr.microsoft.com/playwright:v1.59.1-noble and the same visual configuration. Update that image together with the pinned Playwright dependency. Functional tests are not forced into the visual environment. The manual Update export screenshots workflow remains available.

The Visual tests workflow first compares committed baselines and retains its report. That comparison is advisory: failure is recorded as a warning, not reported as a successful comparison. Candidate generation and two repeated candidate comparisons with --retries=0 must succeed. Repeatability does not prove design correctness. Inspect visual-review/status.json and both artifacts. Never adopt candidates from failed generation or validation.

## Automated baseline pull requests

Only a non-bot push to main after successful visual validation starts the publishing job. PR runs intentionally skip that write job. It regenerates candidates in the pinned environment and validates them twice with --retries=0.

The publisher validates exactly these four regular PNG files:

- tests/e2e/create.spec.ts-snapshots/qr-no-frame-chromium-linux.png
- tests/e2e/create.spec.ts-snapshots/qr-no-frame-as-jpg-chromium-linux.png
- tests/e2e/create.spec.ts-snapshots/qr-with-frame-chromium-linux.png
- tests/e2e/create.spec.ts-snapshots/qr-with-frame-as-jpg-chromium-linux.png

All four candidates must be present and valid PNGs. One to four files may actually differ from main. Missing, duplicate, unexpected Linux candidate files, symlinks or invalid PNG signatures fail validation.

If no candidate differs from the checked-out source, publication makes no API calls and creates no branch or PR. It does not close an older open PR in this no-change case; review or close any superseded PR manually.

The reserved branch ci/visual-baselines is reused across main commits. Do not edit it manually: the publisher may force-update it. Its commit is built from the source main tree with only the four allowlisted blob entries replaced. Application code, workflows, functional tests, installers, reports and unrelated worktree changes cannot enter the published tree through this script. The existing open PR from that branch to main is updated instead of opening a PR for each source SHA.

Before publication, the script checks that main still points to the source SHA; it checks again before moving the branch. A stale run reports stale-main and does not update the branch or PR. Workflow concurrency cancels older runs on the same ref. A rerun with the same source and candidate tree reuses the existing branch commit.

Node's built-in fetch calls the GitHub REST API with an explicit GITHUB_TOKEN Authorization header. Neither git push, stored Git credentials, gh CLI, nor third-party Node packages are needed. The checkout retains persist-credentials: false. The token is exposed as an environment variable only to the publishing step. Only the publishing job requests contents: write and pull-requests: write. Run steps explicitly use Bash. PR metadata is interpolated in JavaScript, including source SHA and workflow URL.

The automation neither approves nor merges PRs. A maintainer must inspect the image diff and functional checks before merging. A successful candidate comparison is not design approval.

## Repository setting and workflow approval

A repository administrator must allow GitHub Actions to create pull requests under Settings > Actions > General > Workflow permissions. Organization policy may override this. This change does not modify repository settings or branch protection. No personal access token is introduced.

GitHub may require a maintainer to approve workflow runs on token-created PRs. If offered, use Approve workflows to run. Successful mocked tests cannot verify live repository permission settings.

## Publication tests before merging

`node --test .github/scripts/publish-visual-baselines.test.mjs`

The read-only visual job runs these tests on PRs: allowlist and PNG checks, metadata interpolation, explicit token requirement, unchanged no-op, stale source, create/update behavior, commit idempotency, API failure propagation and a CLI dry run in a temporary Git repository. API writes are mocked; tests do not contact GitHub.

After candidate generation and repeated comparison, the same PR job runs the real publisher with --dry-run against actual candidates. This checks file collection, change detection and metadata without obtaining a write token or contacting GitHub. Production publication remains restricted to main pushes. The live API path, repository permissions and resulting image PR must still be verified after merge.

## Acceptance checkpoint

- Functional Unit & Browser Tests, E2E Tests and Production build succeed.
- Export format, dimensions, pixels and payload round-trips pass, including repetitions.
- Inspect the original visual comparison outcome separately from the overall workflow status.
- Candidate generation, two comparisons, publisher tests and candidate dry run succeed.
- Review all four candidate images against the intended design.
- After merge, inspect the publishing job and any resulting baseline PR.
- Baseline PR changes are confined to the four allowlisted PNGs; inspect the diff before merging.

If required checks are configured later, require the functional checks, not the advisory visual comparison. CI success alone does not approve the design.
