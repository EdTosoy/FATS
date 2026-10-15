# Phase 0 / Phase 1 verification

Current account safety/database recovery evidence: [Phase 4.1 verification](PHASE_4_1_VERIFICATION.md). [Phase 4 verification](PHASE_4_VERIFICATION.md) records the original account/database baseline. The results below are historical.

This is the historical Phase 0/1 report. Current Sidekick evidence is in [Phase 3 verification](PHASE_3_VERIFICATION.md). Data safety evidence is in [Phase 2.1 verification](PHASE_2_1_VERIFICATION.md). See [Phase 2 verification](PHASE_2_VERIFICATION.md) for the current manual interview slice, executed checks, and limitations.

Verified locally on 2026-10-15 with Node 24.21.0, pnpm 11.27.0, and system Chromium. The existing branch is `master`; the repository initially had no tracked files. All implementation files remain uncommitted. No publishing, deployment, or production changes were performed.

## Executed results

Nx checks used `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` in this restricted environment. Dependency installation, local servers/build workers, and Chromium were run with scoped environment permission. Chromium's sandbox remained enabled.

| Command / check                                 | Result | Evidence                                                                                                                                          |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                  | PASS   | Dependencies and lockfile created with pnpm 11's explicit `allowBuilds` configuration.                                                            |
| `pnpm install --frozen-lockfile --offline`      | PASS   | Completed against the cached packages without changing dependency resolution.                                                                     |
| `pnpm dev`                                      | PASS   | Root Nx task started Next.js on port 3000; the final browser suite reused this server.                                                            |
| `pnpm typecheck`                                | PASS   | All three projects passed; later reruns reused the unchanged domain's successful Nx result.                                                       |
| `pnpm lint`                                     | PASS   | All three projects passed with zero lint warnings.                                                                                                |
| `pnpm test` and `pnpm exec vitest run`          | PASS   | Two test files, 29 unit tests.                                                                                                                    |
| `pnpm test:e2e`                                 | PASS   | 14 tests across desktop and mobile, final run 38.9 seconds, no unexpected browser console/page errors.                                            |
| `pnpm format:check`                             | PASS   | Source, configuration, and documentation match Prettier.                                                                                          |
| `pnpm build`                                    | PASS   | Final optimized Next.js production build completed, including its TypeScript step.                                                                |
| `pnpm start` + local HTTP probe                 | PASS   | Production server became ready; dashboard, list, detail-route shell, Resumes, Interviews, Help, and Settings returned HTTP 200 with FATS content. |
| `git diff --check` + new-file whitespace checks | PASS   | Tracked diff and each new text file checked.                                                                                                      |
| Moodboard SHA-256 comparison                    | PASS   | All three originals retain their initial hashes.                                                                                                  |
| Text contrast calculation                       | PASS   | Action button 5.68:1, body 14.14:1, muted text 5.05:1, checked status text above 5:1 against its fill.                                            |

Local smoke-test servers were stopped after verification. Their intentional Ctrl-C exit codes are not startup failures. The Node `NO_COLOR`/`FORCE_COLOR` messages are tooling warnings; the browser runtime checks passed.

## Acceptance evidence

- Fresh workspace: zero statistics, useful onboarding, clear save action, no fabricated applications or interview dates.
- Real browser save → repository → local storage → detail → reload flow on both viewports.
- Detail edits and all seven statuses survive reload. Identity and creation timestamps are preserved by domain and adapter tests.
- Actual state drives dashboard totals, Saved count, in-progress count, offers, and recent applications.
- Case-insensitive trimmed search and status filters work together; clear filters restores the list. Description search is covered too.
- Desktop navigation and the mobile menu reach the planned page shells. Resume uploads and scheduling do not appear as working controls.
- Required-field validation, focus containment, Shift-Tab/Tab, Escape cancellation, and focus restoration are exercised.
- A failed browser write keeps the form draft and the previous saved record. Corrupted data is reported, left untouched, and never shown as an invented empty workspace.
- Desktop 1440 × 1100 and mobile 390 × 844 CSS-pixel layouts were exercised. The dashboard, list, detail, and scrollable dialog were visually inspected; core dashboard/list/dialog overflow assertions passed.

## Visual artifacts

The full browser run creates ten local PNGs in ignored `test-results/`, covering empty/populated dashboards, application list/detail, and dialog at desktop/mobile widths. They contain only the explicit sample profile and synthetic test jobs. They were inspected for layout and sensitive content and were not uploaded.

Examples from the final run:

- `test-results/applications-first-time-da-5a19d-sable-and-fits-the-viewport-desktop/dashboard-empty.png`
- `test-results/applications-first-time-da-5a19d-sable-and-fits-the-viewport-mobile/dashboard-empty.png`
- `test-results/applications-search-and-st-5f2fb-r-and-every-status-persists-desktop/applications-populated.png`
- `test-results/applications-search-and-st-5f2fb-r-and-every-status-persists-mobile/applications-populated.png`
- `test-results/applications-form-validate-138fc--and-cancels-without-saving-mobile/save-job-dialog.png`

Playwright regenerates this directory on subsequent runs; these are local verification artifacts, not committed product assets.

## Resolved findings and limits

Verification caught and resolved pnpm 11 build-script configuration, React effect linting, an overly broad Next route-announcer alert selector, screenshot capture before hydration, and Next.js 16's loopback dev-origin restriction. Failed checks were investigated and rerun; no unresolved failure is classified as pre-existing.

**NOT RUN:** Firefox/WebKit, a full accessibility audit, assistive-technology testing, multi-device sync, and transactional simultaneous-tab behavior. Mobile tests use Chromium with iPhone-sized viewport/touch emulation, not native iOS Safari. The repository has no backend, file uploads, scheduling, authentication, or device sync to verify. ESLint 9 remains pinned for installed plugin compatibility and needs a future supported-stack upgrade. Local storage is not durable account storage; simultaneous tab writes can overwrite each other.

The recommended next slice is manually scheduled interview records linked to applications. Phase 2 was not started.

## Files added

The complete source/configuration/documentation inventory follows. Existing `uiux/*.png` files are unchanged; generated dependencies, builds, caches, and screenshots are ignored.

```text
.gitignore
.nvmrc
.prettierignore
.prettierrc.json
AGENTS.md
README.md
apps/web/AGENTS.md
apps/web/next-env.d.ts
apps/web/next.config.ts
apps/web/package.json
apps/web/postcss.config.mjs
apps/web/src/app/applications/[id]/page.tsx
apps/web/src/app/applications/page.tsx
apps/web/src/app/error.tsx
apps/web/src/app/globals.css
apps/web/src/app/help/page.tsx
apps/web/src/app/icon.svg
apps/web/src/app/interviews/page.tsx
apps/web/src/app/layout.tsx
apps/web/src/app/not-found.tsx
apps/web/src/app/page.tsx
apps/web/src/app/resumes/page.tsx
apps/web/src/app/settings/page.tsx
apps/web/src/components/app-shell.tsx
apps/web/src/components/application-detail.tsx
apps/web/src/components/application-list.tsx
apps/web/src/components/application-provider.tsx
apps/web/src/components/application-table.tsx
apps/web/src/components/brand.tsx
apps/web/src/components/dashboard.tsx
apps/web/src/components/job-form-dialog.tsx
apps/web/src/components/ui.tsx
apps/web/src/lib/local-application-repository.ts
apps/web/tsconfig.json
docs/ARCHITECTURE.md
docs/DESIGN_SYSTEM.md
docs/PRODUCT.md
docs/ROADMAP.md
docs/VERIFICATION.md
eslint.config.mjs
libs/domain/package.json
libs/domain/src/index.ts
libs/domain/tsconfig.json
nx.json
package.json
playwright.config.ts
pnpm-lock.yaml
pnpm-workspace.yaml
tests/e2e/applications.spec.ts
tests/unit/application.test.ts
tests/unit/local-application-repository.test.ts
tools/project.json
tsconfig.base.json
tsconfig.tools.json
vitest.config.ts
```
