# Functional and visual test separation (steps 1-9)

Starting main commit: 00984dfca0a3451826734a7637f8796d446d82e3.
Working branch: ci/separate-functional-and-visual-tests. No application files, Proxmox installers or baseline PNGs are modified by this change.

## Functional acceptance

`pnpm test:e2e` uses playwright.config.ts and tests/e2e only. The four existing export cases now check downloaded PNG/JPEG files with sharp, explicit 400px QR dimensions, SVG/raster proportions for framed output, frame background pixels and QR payload round-trips through the actual scanner. SVG vector and unsafe-URL tests remain. Preview screenshots are not part of functional acceptance.

The Tests workflow runs unit/browser tests, all functional E2E tests, two additional repetitions of the four export cases without retries, and a production build. Functional failures are not suppressed. Existing test names for the two original jobs are retained.

## Visual acceptance

`pnpm exec playwright test --config=playwright.visual.config.ts --update-snapshots=none`

Four preview comparisons live in tests/visual/export.visual.spec.ts. Snapshot paths explicitly retain tests/e2e/create.spec.ts-snapshots and existing PNG filenames; no binary image migration is needed. The 1% pixel tolerance is unchanged. Viewport, scale, locale, timezone, color mode and reduced motion are explicit. Each case gets a clean browser storage state with service workers blocked. Helpers wait for QR content updates, fonts, HTML images and a stable preview rather than using a fixed screenshot delay.

Both visual workflows use the same configuration and mcr.microsoft.com/playwright:v1.59.1-noble. That image must be updated together with the pinned Playwright dependency. The normal functional suite is not forced into the visual environment.

The Visual tests workflow first compares committed baselines and retains its report. That comparison step is advisory (continue-on-error); its failure is recorded as a warning, not presented as a successful comparison. Candidate generation and two repeated candidate comparisons must actually succeed. Their success demonstrates repeatability, not correctness of the design. Review visual-review/status.json and the two artifacts. Never adopt candidates from a failed generation/validation run.

The manual Update export screenshots workflow remains available and uses exactly the same visual environment.

## Automated baseline pull requests

After a trusted push to main, the `Prepare reviewed visual baseline PR` job regenerates candidates in the same visual environment, validates them twice without retries, and publishes only if all four Chromium/Linux PNGs were regenerated successfully.

The publishing job writes only files matching `tests/e2e/create.spec.ts-snapshots/*-chromium-linux.png`. It rejects the publication if the count is not exactly four. It creates a commit-specific branch such as `ci/visual-baselines/<short-sha>` and opens or updates one pull request against main.

The PR contains only the four baseline PNGs. Application code, workflow code, functional tests, Proxmox installers, reports and other artifacts are never committed by this automation. If no committed baseline changes, no branch and no PR are created.

The automation uses the repository `GITHUB_TOKEN` with narrowly scoped `contents: write` and `pull-requests: write` permissions. It does not approve or merge its own pull request. The visual comparison remains advisory; a maintainer must inspect the image diff and decide whether to merge.

GitHub may require a maintainer to approve workflow runs for pull requests created or updated using `GITHUB_TOKEN`. In that case, use the `Approve workflows to run` control on the visual baseline pull request.

## Checkpoint before merging

- Tests: Unit & Browser Tests, E2E Tests and Production build succeeded.
- Four actual exported images passed format/dimension/payload checks, including repeated cases.
- Visual comparison outcome inspected, not inferred from the overall advisory workflow status.
- Candidate generation and both repetitions succeeded.
- Four Linux candidate PNGs visually reviewed against the intended design.
- Repeat the unchanged commit if nondeterminism is suspected.
- The baseline publishing job is restricted to pushes to main, excludes bot-triggered runs, requires visual success, and publishes exactly four PNGs.

Branch protection/required checks have not been changed. If the repository later enables required checks, require the functional checks, not the advisory visual comparison. This branch is not accepted or merged merely because the candidate generator is green. A live CI run and human image review are still required.
