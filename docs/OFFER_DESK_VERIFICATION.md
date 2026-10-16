# Offer Desk verification

Executed on 2026-10-16 using Node 24.21.0 and pnpm 11.27.0. The initial working tree was clean on `main`; read-only remote inspection confirmed local/remote main at `1d3ae1ba8bbe33bd65ded6cc30527626fb32e0d7`. No commits, pushes, deployment, live AI evaluation, or user-database migration were performed.

## Environment and scope

Tests used the existing labelled disposable PostgreSQL 17 container/database on loopback port 16432 and the isolated Mailpit inbox on ports 11025/18025. Test credentials remained in ignored private configuration. Integration fixtures used unique synthetic owners. Recovery drills created and removed their own uniquely named test databases and private temporary file directories. No current browser workspace was seeded. Browser tests used repository Playwright and sandboxed Chromium at 1440 × 1100 and the iPhone 13 profile (390 × 664). Account production tests disabled external AI configuration.

`implement-feature`, `visual-iterate`, and `verify-changes` guided implementation and verification. Installed Next.js 16.4.0 route-handler documentation and existing repository paths supplied framework evidence. No dependencies or lockfile changes were needed.

## Executed checks

| Result                            | Command / scope                                                                                          | Evidence                                                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PASS                              | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck`                                                | All four workspace targets; later focused tools typecheck covered added test cases. Production build also typechecks web.                                                                  |
| PASS                              | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`                                                     | All workspace targets. Focused ESLint checks covered subsequent offer UI/handler/test refinements.                                                                                         |
| PASS                              | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test`                                                     | Full unit target, including five new offer domain tests.                                                                                                                                   |
| PASS                              | `pnpm test:integration tests/integration/offers.test.ts`                                                 | Nine actual PostgreSQL/API cases, including transaction rollback, retries, races, and multilingual payloads.                                                                               |
| PASS                              | `pnpm test:integration tests/integration/documents.test.ts`                                              | Six existing private file, ownership, version/reference, corruption, and deletion cases. Executed in the combined integration command below.                                               |
| PASS                              | `pnpm test:integration tests/integration/postgres.test.ts tests/integration/database-operations.test.ts` | 21 tests after updating expected migration ledger/count to six. Actual confirmed database/file recovery preserved offer history, checklist/questions, decisions, linked version and bytes. |
| PASS                              | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build`                                                    | Production build, including `/api/offers`; scoped socket permission required for Turbopack.                                                                                                |
| PASS                              | `FATS_TEST_PRODUCTION=1 pnpm test:e2e:account tests/account-e2e/offers.spec.ts`                          | Six real UI/API/PostgreSQL journeys across desktop/mobile, including a committed write with lost response and background refresh.                                                          |
| PASS across focused runs          | Production account/document regression journeys                                                          | All 14 existing desktop/mobile scenarios validated; see throttling note below.                                                                                                             |
| Executed; focused follow-up below | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test:e2e`                                                 | 40 of 42 guest journeys passed. Two desktop status-feedback collisions were corrected; mobile counterparts passed after the fix. See final focused results below.                          |

The initial combined integration run was:

```sh
pnpm test:integration tests/integration/offers.test.ts tests/integration/documents.test.ts tests/integration/postgres.test.ts tests/integration/database-operations.test.ts
```

It exposed outdated five-migration assertions and the expected change in referenced-document deletion feedback. Those expectations were updated to verify migration 0006 and the specific offer-history guard. The affected suites then passed. Early new-suite failures from auth-before-migration initialization and an incorrectly formatted synthetic interview timestamp were corrected in the test setup/fixture. No authentication or interview validation was relaxed.

The broader production browser command was:

```sh
FATS_TEST_PRODUCTION=1 pnpm test:e2e:account tests/account-e2e/offers.spec.ts tests/account-e2e/accounts.spec.ts tests/account-e2e/documents.spec.ts
```

It passed 13/18 before cumulative loopback sign-ins hit the real shared sign-in limiter. That run is **FAIL**, not a clean suite pass. The affected three existing mobile regressions then passed with the same production settings in a smaller batch:

```sh
FATS_TEST_PRODUCTION=1 pnpm test:e2e:account tests/account-e2e/accounts.spec.ts tests/account-e2e/documents.spec.ts --project=mobile --grep 'invalid login|private library|upload failure'
```

The separately run Offer Desk suite passed all desktop/mobile cases. The test helper clears the isolated database's rate-limit state before each invocation; runtime protection/configuration was unchanged. Initial Offer Desk browser assertions were also corrected to target the actual control/link and distinguish visible summary text from collapsed historical details. The guest suite caught an additional empty Offer Desk status region in guest mode; the component now renders its offer-save status only for accounts. Existing guest assertions were preserved.

## Covered behavior and invariants

- Creating offers from a real saved application, received-date requirement, optional/unknown fields, exact decimal string amounts, and independent manual application status.
- Complete immutable term snapshots, dated negotiation notes, latest terms by recording sequence, and retrieval of original compensation.
- Checklist states and HR questions surviving reload. An incomplete checklist does not block a confirmed decision.
- Date-only deadlines at timezone midnight, approach/passed labels, DST-calendar behavior, dashboard response links, and resolved-offer removal from the response list. Expiration never infers withdrawal.
- Acceptance cancellation, required acknowledgment, dated acceptance/decline/employer withdrawal, reopening, and retained decision history.
- Existing private upload endpoint, exact version association, authorized PDF preview/download, retained archive references, cross-owner rejection, and deletion restriction even after the latest revision removes the letter.
- Live session/verified-email/origin/stale-account checks, invalid payloads, server-derived ownership, database foreign keys, safe errors, per-owner snapshot reads and write serialization.
- Same-request retry deduplication, changed-payload request-ID rejection, concurrent-version conflict, explicit reload retaining drafts, failed-history rollback, and a lost committed response followed by background refresh and identical retry.
- JSON omission/replacement protection, application deletion protection, offer/header account-cascade behavior without documents, and the existing document lifecycle restrictions. No new public account-deletion endpoint was added.
- A complete operator database/file archive restored exact offer/header/history equality and actual linked file bytes, while retaining existing recovery confirmation, rollback, migration checksum, and session/token revocation checks.
- Existing account CRUD, interviews, guest transfer/retry, JSON round trips, expiry drafts, isolation, document library/archive/download, guest corruption/write errors, Sidekick web intake, responsive navigation and modal cancellation.

## Visual and accessibility evidence

Inspected actual desktop and mobile screenshots of Offer Desk, the initial form, and passed-deadline state. Optional fields start behind native disclosure groups; current terms/history can expand; the timeline defaults collapsed. Initial creation omits redundant entry notes so the Save action fits the mobile viewport. Warm existing tokens, native labeled inputs/selects, Radix modal focus, date-only explanations, and text beside deadline colors are retained. Browser assertions cover keyboard Tab to currency, Escape from PDF preview, focus returning to the decision opener, confirmation validation/cancellation, and no horizontal overflow. The Offer Desk browser fixture rejects unexpected page runtime errors.

Local synthetic screenshots are retained under `test-results/offer-desk-evidence/` after final verification. These are ignored artifacts, not uploaded/published assets. This is focused keyboard/semantic/responsive evidence, not a complete screen-reader audit or accessibility certification.

## Limits and intentionally omitted checks

- NOT RUN: live AI/provider evaluation, hosted storage, production deployment, external delivery, malware scanning, and real-employer interactions. They are excluded or paused.
- SKIPPED: extension package build/browser suite; no extension package or protocol changed. Existing Sidekick web journeys were included in the guest suite.
- SKIPPED: unrelated matching-specific integration/browser suites. Existing deterministic recovery fixtures remain unchanged and invoke no external provider.
- Offer Desk is verified-account only, with one exact linked file per terms revision, date-only deadlines, explicit saves, and no offer-history deletion UI. JSON exports omit it; complete recovery requires the operator bundle. Draft persistence does not survive page reload/navigation.
- Only disposable local recovery is established. No hosted/off-device recovery claim is made. All original UI moodboard hashes remained unchanged.

## Final focused results

- PASS: `pnpm exec playwright test tests/e2e/applications.spec.ts --project=desktop --grep 'creates, edits|search and status'` — both previously failing guest scenarios passed. Along with the 40 passing scenarios from the full guest run, all 42 guest scenarios have successful executed evidence. The earlier full command remains recorded as a failed run with resolved failures; it was not rerun in full merely to replace its result.
- PASS: final `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build`, followed by `FATS_TEST_PRODUCTION=1 pnpm test:e2e:account tests/account-e2e/offers.spec.ts` — all six final production journeys passed, including the initial Save button being in the viewport on both desktop and mobile. No additional runtime page errors or horizontal overflow were observed.
- PASS: final full `pnpm format:check`, focused ESLint for changed offer components/handler/tests, focused tools TypeScript checks, and `git diff --check`. Type/lint/unit checks were not broadened repeatedly after sufficient relevant evidence passed.
- PASS: SHA-256 comparison retained all four `uiux/*.png` hashes, including the three original moodboards. No dependency, package-manager, lockfile, auth configuration, interview implementation, or AI implementation change was introduced.
- Final synthetic screenshots: `test-results/offer-desk-evidence/desktop-offer-form.png`, `desktop-offer-desk.png`, `desktop-offer-passed-deadline.png`, and corresponding `mobile-` files. Final mobile/desktop form and detail images were visually inspected. Next's build-generated `next-env.d.ts` route-path change was returned to its original tracked content; feature work remains uncommitted.

The dedicated test services were left available. Tests changed only synthetic test data and disposable restore targets. Apply `pnpm db:migrate` explicitly to the intended local development database before running the updated account UI; this task did not migrate that database.
