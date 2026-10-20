# Product integration and UX verification

Date: 2026-10-19. Baseline: clean `main` at
`0ad1a069527047c29f912a3a0a7d702cf1fa69d5` (`feat(ui): refine dashboard and
add global dark mode`), after Momentum `a908b43`, PDF Tools `6297c1b`, and
quarantine/parser hardening `a2a75d1`. The Welcome Card V2, global appearance
provider and Momentum refinements are committed in that checkpoint. No significant
uncommitted work existed before this review. No commit or push was made.

Read the root/web instructions, product/architecture/design documentation, recent
UI, Career Vault, PDF Tools and hardening verification, beta readiness, Momentum,
configuration and relevant backup/security guidance. Checked installed Next 16.4
[linking/navigation documentation](../apps/web/node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md)
before changing the existing client navigation composition. Existing native
controls, Radix dialogs, semantic palette and repository boundaries are retained.

## Outcome and scope boundary

The synthetic desktop and narrow journeys have exercised registration and email verification,
manual save, real packaged Sidekick capture and final confirmation, manual stages,
two completed interviews with notes, offer review/negotiation/revision/acceptance,
explicit employment creation, metadata-only document tracking, local PDF export,
and version 3 backup preview/import into another verified account.

**Resume library intake/version management remains blocked by the required scanner.**
The demo generates two local synthetic resume revisions and verifies a real upload
returns 503 without creating a usable document or losing the draft. It does not
claim those revisions were accepted, submitted or managed in the library. This
part of the requested end-to-end definition cannot be completed while scanning is
paused and bypasses are prohibited. No scanner installation, fake acceptance,
quarantine exception or alternative upload path was introduced.

The product can be rehearsed locally with that visible limitation. **It must not
be declared ready for real personal-data beta testing.** There is no new onboarding
wizard, employer communication, automatic employment conversion, AI development,
public deployment, paid service or major product feature.

## Defects and bounded fixes

| ID  | Observed problem / cause                                                                                                                                                                 | Change and evidence                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I1  | Resumes and Career Vault sign-in links requested a return path that the older allowlist rejected, sending the graduate to Settings.                                                      | Extend only the supported route allowlist, including local PDF Tools and Help. Four added cases failed before repair; all 15 return-path cases pass after it. External, looping, API and unknown-child paths remain rejected. The product journey exercises real registration back to Career Vault and sign-in back to Resumes.                              |
| I2  | Default verified sign-in lands in account settings without a direct primary action to begin tracking.                                                                                    | Add **Open your dashboard** beside Sign out using the existing action-row spacing. Keep the existing destination and account/guest transfer behavior. Dashboard and Help supply the existing lightweight onboarding.                                                                                                                                         |
| I3  | Acceptance ended at Offer Desk with no onward action to Career Vault.                                                                                                                    | Show **Plan employment in Career Vault** only for an accepted offer, explaining explicit prefill and save. Reuse the existing optional accepted-offer prefill; no new creation logic. Browser assertions verify zero employments after acceptance and after prefill, then Not started on the form before explicit save and a separate explicit Current edit. |
| I4  | Disabling the upload submit control during a rejected request leaves keyboard focus outside the still-open modal.                                                                        | Focus the actual error message when an upload/local-validation error is rendered. Keep file/name/request identity and the required security failure. The before-fix product focus check fails on desktop/mobile; a focused intake regression requires the alert to receive focus.                                                                            |
| I5  | Mobile navigation has an expanded/collapsed control but no Escape return path.                                                                                                           | Escape from the navigation closes it and restores focus to the toggle. Existing route-click behavior and Momentum remain unchanged.                                                                                                                                                                                                                          |
| I6  | Breadcrumbs expose raw paths such as `Career-vault` and `Resumes/pdf-tools`.                                                                                                             | Resolve page names from the existing navigation labels and explicit PDF Tools/Sidekick names. No new routes or global menu entries.                                                                                                                                                                                                                          |
| I7  | Help omits Sidekick and the offer → employment transition; backup and erasure descriptions omit Career Vault. Library guidance encourages uploads without explaining unavailable checks. | Add concise Sidekick/lifecycle guidance; describe supported JSON records and unlinked files accurately; include vault history in erasure copy; explain fail-closed uploads and separate local PDF Tools. Update the affected Help assertions.                                                                                                                |
| I8  | Six documented backup browser failures expect a storage envelope without Momentum's committed `activityDays`.                                                                            | Reproduce all six failures, then assert the exact retained activity dates (or empty ledger when recovering unreadable data). No adapter/domain/counting code changes. All six affected cases pass in the subsequent guest run.                                                                                                                               |

No application/offer calculation, interview relationship, employment rule,
ownership check, authentication endpoint, file promotion/download authorization,
PDF engine, migration, dependency or AI contract was changed. Imported files
remain unavailable historical references; Received still does not imply stored
bytes. All seven application stages remain manual.

## Synthetic story and data integrity

**Alex Rivera (Synthetic)** is a fictional 2026 Information Systems graduate.
The ordinary product journey creates:

- Junior Data Analyst at Harborlight Labs (Synthetic), manually saved with a
  fictional source and academic-project description.
- Graduate QA Associate at Luntian Software (Synthetic), captured from the supplied
  local HTML listing through temporary toolbar authority and the packaged bridge.
- HR and technical/project conversations, explicitly scheduled in Asia/Manila,
  prepared, reflected upon and completed without updating the application stage.
- Optional offer terms: PHP 28,000 monthly, benefits, HR questions, a negotiation
  note, PHP 30,000 revision and explicitly confirmed acceptance with full history.
- One employment connected to the same application/accepted offer. Prefill starts
  Not started; a later manual edit records Current and the actual synthetic date.
- An employment-contract register entry with Requested → Received snapshots and
  no attachment. No employer/government request is sent.
- Generated local resume revisions and a four-page form. PDF Tools fills a form
  field and adds a positioned mark, downloads a parseable four-page PDF and sends
  zero POST/PUT/PATCH/DELETE requests during editing/export.
- Version 3 JSON with two applications, two interviews, five offer events and one
  employment with document history. Preview/cancel changes no records; a second
  normally registered/verified account confirms import and retains the exact vault
  snapshot/history. Its account is then erased through the authenticated endpoint.

The browser checks no account workspace in localStorage, no external HTTP origins,
no matching endpoint requests during the product journey, theme persistence, no
horizontal page overflow, and no unhandled page errors. Passive appearance/page
changes and preview leave the original Momentum dates unchanged. Existing account
regressions separately verify guest/account/other-account isolation, expired drafts,
lost-response retry, and account erasure of legacy/quarantined bytes.

## Visual and accessibility review

The reference remains the committed FATS design system and Welcome V2; no decorative
redesign, font download or component framework was introduced. Actual production
Chromium screenshots cover empty/populated dashboard, applications/detail,
interviews/notes, Resumes and its rejected-upload modal, accepted Offer Desk and
review dialog, Career Vault list/register/history/form, PDF Tools with white paper,
Settings/import preview, Help, Sidekick review/handoff and authentication.

Light/dark desktop and narrow renders are retained locally. The product journey
uses 1440×1000 and 390×844 CSS-pixel viewports; existing guest/account tests use
1440×1100 and iPhone 13 Chromium emulation. The narrow extension session is still
desktop Chromium, not a claim that mobile browsers support MV3 Sidekick.

Inspected screenshots for hierarchy, panel spacing, field boundaries, status text,
long-form scrolling, background separation and consistency between dashboard,
Offer Desk and Career Vault. The new account actions use the existing wrapping
row. A first PDF demo mark overlapped the fixture heading; the rehearsal now fills
the native name field and positions its separate mark below the form, without
altering the editor. The sidebar widths, Welcome V2 proportions and Momentum
presentation remain intact.

Keyboard evidence covers modal containment, accessible field names, Escape/cancel
and focus return, upload-error focus, mobile navigation Escape, and required
decision confirmation. Existing palette unit checks exercise AA text/control
contrast roles; guest browser checks verify light/dark PDF pixels and exported
bytes remain identical. These are focused accessibility checks, **not WCAG
certification, screen-reader testing or an axe audit**. No new accessibility
dependency was installed. Native dropdowns retain browser appearance via the
existing theme `color-scheme`.

Evidence directories are ignored and local:

- `.fats-private/product-integration-evidence/`: final narrow product renders in
  both themes; the retained desktop run is under the demo evidence below.
- `.fats-private/product-guest-regressions/`, `product-account-regressions/`,
  `product-guidance-final/`, `product-recovery-final/`, and `product-focus-before/`:
  scoped regression evidence, including failed-run diagnostics.
- `test-results/product-baseline/`: initial authentication light/dark captures
  (ordinary test tooling may recreate this directory).
- `.fats-private/cofounder-demo-evidence/`: retained demo preparation screenshots,
  separate from the normal product test output.
- `.fats-private/product-visual-review/`: inspected light/dark desktop and narrow
  overview sheets made from the actual captures. Dialog captures use the viewport;
  full-page captures start at the top so fixed elements retain their correct position.

No screenshots or traces were uploaded. Product preparation disables tracing so
registration/verification request bodies do not enter its artifacts. Existing
regression failure traces can contain test credentials and remain private.

## Executed checks

Environment: Node 24.21.0, pnpm 11.27.0, installed Next 16.4.0/Playwright/Chromium,
dedicated loopback PostgreSQL and Mailpit. Chromium's sandbox remains enabled.
Restricted Docker/parser/build/browser operations used scoped execution permission;
no persistent sandbox bypass or host installation was made. Build and browser runs
must be sequential because they share the same `.next` directory.

| Result              | Command / scope                                                                                                                                                                                                                                          | Evidence                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS                | `pnpm db:test:up`; `pnpm mail:test:up`                                                                                                                                                                                                                   | Existing labelled local test services; no credentials printed.                                                                                                                                                                                                                                                                                                         |
| PASS                | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm exec vitest run --no-file-parallelism --exclude 'tests/unit/matching*.test.ts'`                                                                                                                           | 228 tests / 21 files after the navigation regression additions; real constrained parser tests included.                                                                                                                                                                                                                                                                |
| PASS                | `pnpm exec vitest run tests/unit/account-navigation.test.ts`                                                                                                                                                                                             | 15 tests; four new supported destinations demonstrably failed before repair.                                                                                                                                                                                                                                                                                           |
| PASS                | `pnpm test:integration --exclude 'tests/integration/matching.test.ts' --exclude 'tests/integration/database-operations.test.ts'`                                                                                                                         | 76 passed / two skipped, nine passing files and one skipped. Covers ownership, relationships, Momentum, offers/vault, quarantine, erasure and parser runtime. Actual scanner prerequisite cases stay skipped.                                                                                                                                                          |
| PASS                | `pnpm test:integration tests/integration/database-operations.test.ts -t 'consistent PostgreSQL\|previews without writes\|real confirmed restore\|in-use target\|rolls back schema'`                                                                      | Five passed; dormant matching-file case deliberately filtered. Independent disposable source/restore databases, actual restore and rollback; no user database.                                                                                                                                                                                                         |
| PASS across batches | `FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3101 pnpm exec playwright test --ignore-snapshots --grep-invert 'without Sidekick installed' --output=.fats-private/product-guest-regressions`, then scoped `tests/e2e/private-beta.spec.ts`                      | Initial batch: 62 passed / two Help-copy assertions failed. Updated wording assertions: two passed. All 64 selected guest cases have successful evidence. There are no snapshot-baseline assertions in this suite; the unnecessary `--ignore-snapshots` flag in that initial command did not remove a check. The required-origin missing-extension cases are separate. |
| PASS across batches | Account batch selecting `accounts`, `career-vault`, `document-intake`, `portable-backups`, `recovery` on port 3102, then `FATS_TEST_PRODUCTION=1 pnpm test:e2e:account tests/account-e2e/recovery.spec.ts --output=.fats-private/product-recovery-final` | Initial batch: 28 passed / four recovery harness failures. All six recovery cases pass at their hardcoded port-3000 origin. The unchanged recovery tests sent a 3000 Origin to a 3102 server; the narrow origin guard correctly rejected it. No guard was widened.                                                                                                     |
| PASS                | Initial production `theme.spec.ts -g authentication` account batch                                                                                                                                                                                       | Two desktop/mobile real registration/verification/recovery theme journeys.                                                                                                                                                                                                                                                                                             |
| PASS                | `pnpm build:extension`; `pnpm verify:extension` with Nx restricted-agent prefixes                                                                                                                                                                        | Existing MV3 permission, local-bundle and bridge checks.                                                                                                                                                                                                                                                                                                               |
| PASS                | `NODE_ENV=production pnpm demo:start` (expected refusal, exit 1)                                                                                                                                                                                         | Refuses before reading private configuration or starting a server.                                                                                                                                                                                                                                                                                                     |

Additional executed checks:

| Result | Command / scope                                                                                                                                             | Evidence                                                                                                                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS   | `FATS_TEST_PRODUCTION=1 pnpm test:e2e:product`                                                                                                              | Two complete desktop/narrow journeys, including actual Sidekick capture, both themes, modal focus, explicit employment, PDF export and version 3 import. Final screenshot capture additionally uses top-aligned pages and viewport-only dialogs to avoid full-page/fixed-element capture artifacts. |
| PASS   | `FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3102 pnpm test:e2e:account tests/account-e2e/document-intake.spec.ts --output=.fats-private/product-focus-final`     | Four cases. The two error-focus assertions fail against the old build and pass with the repair; legacy/quarantine access and erasure stay enforced.                                                                                                                                                 |
| PASS   | `FATS_TEST_PRODUCTION=1 NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test:extension:account --output=.fats-private/product-extension-final`                | Nine packaged extension cases: capture/edit/confirmation, malformed/ambiguous listings, inert markup, permission denial, expiry/reload, forged messages, persistence failure and authenticated handoff.                                                                                             |
| PASS   | `FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/sidekick.spec.ts -g 'without Sidekick installed' --output=.fats-private/product-sidekick-final` | Two missing-extension/manual-save cases at the actual accepted origin. Together with the 64 selected guest cases, all 66 guest cases have successful evidence across batches.                                                                                                                       |
| PASS   | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build`                                                                                                       | Final optimized production compile, TypeScript and route generation; the two unchanged tracing warnings remain.                                                                                                                                                                                     |
| PASS   | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck`; same prefixes with `pnpm lint`                                                                   | All four workspace targets after the final application repair. Later screenshot-helper edits receive focused tools TypeScript/ESLint verification.                                                                                                                                                  |
| PASS   | SHA-256 comparison against HEAD and root manifest comparison                                                                                                | All four moodboards, eleven existing migrations, lockfile, workspace configuration and web/extension manifests unchanged (19 files). Root dependencies/toolchain unchanged; only scripts added.                                                                                                     |

Final demo preparation also **PASS**: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm demo:prepare`
ran the full desktop journey, retained its verified account only after success,
and produced seven private synthetic artifacts. The saved version 3 backup has
two applications, two completed interviews, one five-event accepted offer and one
employment with requested/received contract history and explicit tracking dates.
The credential file is mode 0600 and no credential/session value was printed.
`pnpm demo:start` then **PASS** in a normal development shell: a loopback smoke
check signed in normally, verified those live relationships and signed out. That
temporary web server was stopped; dedicated PostgreSQL/Mailpit remain available.
Use `pnpm demo:start` for the presentation. A final narrow capture refresh also
**PASS** (one complete journey) after improving screenshot framing.

Final `pnpm format:check` and `git diff --check` **PASS**. Focused tools TypeScript
and ESLint checks **PASS** after the final rehearsal-data/screenshot refinements.
Generated Next declaration path churn was returned to the clean starting version.
The working tree contains only the scoped source, tests, demo tooling and
documentation changes; generated credentials, files and images remain ignored.

## Failures and paused checks

The six backup failures were reproduced on the unmodified assertions before their
specific expectation repair. The initial Help browser failures used wording from
before the integration copy update; the focused rerun passes. Early versions of
the new journey used exact wrapping-label selectors, read a URL before navigation
completed, omitted a required meeting URL, and counted an aria-hidden background
heading during modal capture. Those harness mistakes were corrected without
loosening product validation. PDF form application also needs its current preview
to finish rendering before download; the harness now waits for the existing ready
state. Adding actual focus assertions exposed I4 rather
than classifying it as a harness problem.

An initial unrestricted-choice unit command (`vitest run --no-file-parallelism`)
inadvertently included the paused **offline matching/evaluation fixture tests**.
That run was 241 passed / 20 failed under restricted parser execution. This was an
overbroad test selection; all subsequent unit commands exclude `matching*.test.ts`.
No live provider/model call was made, no evaluation/comparison command was run,
and no AI code, fixtures or frozen plan were changed. Non-AI parser checks pass
with their required local containment access.

The frozen comparison plan still expects extraction SHA-256
`23dd7d8ab99e4ab156686f9cb340b7a2d709a581f9d4b4acb8d2fa3417872bcb`, while both
starting HEAD and the untouched file hash to
`f6792e8725904e8021749c3a2ba2303ebaf0775ba378d9c3c52bbb6c27da8973`.
This is verified by `git show HEAD:apps/web/src/server/resume-extraction.ts | sha256sum`
and the working-file checksum. **The AI comparison-hash regression remains
paused and unresolved.** No evaluation is resumed to resolve it.

The restricted initial build and premature production-server starts had no runnable
build ID; subsequent scoped builds and sequential server starts succeeded. The
production build retains the two baseline dynamic-filesystem tracing warnings in
unchanged `document-scanner.ts:40–41`. No packaging/deployment claim follows.

**SKIPPED:** live ClamAV/clean/EICAR/failure verification, accepted-file production
library journeys, paused matching integration/browser/evaluation/comparison work.
**NOT RUN:** real-user usability sessions, native mobile/Firefox/WebKit,
screen-reader/forced-colors/full WCAG audit, hosted delivery/HTTPS, external
penetration/load tests, off-device disaster recovery and deployment.

## Demo operation and remaining concerns

See [the 9-minute co-founder guide](COFOUNDER_DEMO_GUIDE.md) for setup, exact files,
story, repeat procedure and explicit account-erasure reset. Preparation creates a
fresh synthetic account through normal verification; it never clears an existing
workspace. The UI default still starts empty for ordinary users. No automatic
demo seed is bundled into application startup.

Remaining UX concerns: library actions are visible while unavailable scanning
blocks their completion; accepted-file return navigation cannot be demonstrated
yet; raw IANA timezone entry needs explanation; long offer/import/register forms
require scrolling; drafts outside PDF Tools remain volatile; Sidebar PDF Tools is
contextual under Resumes, and Offer Desk remains contextual under an application.
The Interviews default Upcoming filter can show an empty view when all rounds
are completed; Show all interviews retrieves them. Extension appearance is
independent of the web preference. No new navigation
entry or separate wizard was added merely for the demo. These tradeoffs are
documented rather than disguised as working features.

Private-beta blockers remain actual operational scanning, intended-runtime
containment/capacity and supervision, encrypted durable off-device recovery,
retention/deletion registers and backup/WAL expiry, hosted email/HTTPS/restricted
access/abuse controls, monitoring/privacy/support/incident ownership and broader
accessibility evidence. Account deletion covers live data; independent downloads,
inbox copies, operator archives and historical backups still need their own
retention/cleanup policy. See [readiness](PRIVATE_BETA_READINESS.md) and
[Hardening 2](PRIVATE_BETA_HARDENING_2_VERIFICATION.md).
