# Hallmark F02 — guest-to-account continuity

28 October 2026. Scope: the guest → account → Offer Desk journey.

## Preflight and reproduced friction

Read repository/web instructions, the Hallmark audit and decision brief in `/tmp/fats-hallmark-review-package`, F01/F03/F04/F06 verification, and authentication/transfer ADRs 0001/0002. Consulted installed Next.js 16.4.1 page/navigation documentation and the implementation, verification, visual-iteration and React review skills.

F01 is committed as `29bffbc`; F03 and the Next.js patch are in `f20a57e`/`34bdf74`. **F04 and F06 are still uncommitted.** Their existing files and edits were preserved. This task does not commit any milestone.

Current-source browser reproduction passed **4/4**: desktop/mobile, light/dark. A real form saved a synthetic guest application, changed it to Offer, and opened its sign-in link. The gate instructed users to transfer in Settings, but `next` led straight to an application detail in the separate account workspace. Source inspection confirmed that authentication does not copy guest records; an untransferred application is absent from the account repository. Baseline screenshots establish the gate/auth friction, not an exercised pre-change account login.

## Verified journey and UX decisions

1. Offer Desk explains that private offer terms and letter versions require an account. It describes the next preview/confirmation and states that browser originals remain.
2. Sign-in carries a bounded application identifier in `next=/continue-offer/<encoded-id>`. Registration, verification, failed sign-in, reloads and expired-session reconnection retain this destination using the existing authentication flow. A signed-in visitor can continue without another password prompt.
3. The continuation screen reuses `LocalDataMigration`, the existing browser adapter and HTTP repository. It names the destination account, shows browser counts and offers **Preview browser transfer**. Merely signing in or opening this screen sends no migration request.
4. The explicit preview shows applications/interviews to add and identical records to skip. A required, initially unchecked confirmation enables **Copy to account**. Cancel leaves unconfirmed records unchanged. A secondary text link opens account applications without copying.
5. Successful confirmation keeps original browser bytes, refreshes the account view and provides **Continue to Offer Desk** only if the owner-scoped confirmation result contains the requested application. This deliberate final action leaves success feedback visible rather than redirecting before it can be read.
6. No browser applications produces an honest explanation and account-list navigation. A missing requested application does not produce a continuation link. Reloading a preview discards consent and requires a fresh preview. Reloading after success can safely preview the already-transferred snapshot again.

No new dialog, dashboard widget, dependency, CSS theme, authentication endpoint or domain rule. Supporting copy is shorter in the contextual transfer; Settings retains its general transfer/recovery explanation. Existing native controls and design tokens remain. After cancellation/success, keyboard focus returns to the transfer heading; Tab reaches the next available action.

## Safety and outcomes

The existing server remains authoritative: live verified sessions determine ownership; `X-FATS-Account` is checked against that session; account records never fall back into browser storage. Preview stages are owner-bound, expire after 15 minutes and capture the account revision. Confirmation rechecks revision and browser snapshot. Conflicting IDs reject the whole transfer; identical records are skipped. An owner-bound fingerprint and applied stage make retries idempotent. Related records are inserted in one PostgreSQL transaction; originals are neither deleted nor rewritten.

There are no partial record transfers. A connection can fail after the transaction commits, or the copy can succeed while the subsequent account-view refresh fails. These are distinct outcomes:

- Failed/interrupted confirmation keeps the preview and inputs available for safe retry. Closing an attempted preview no longer falsely says that no records changed; it advises previewing again to check what reached the account.
- A confirmed copy followed by a failed view refresh explicitly says **records were copied**, blocks the Offer Desk continuation until recovery, and advises reload/re-preview. Recovery does not add duplicates.
- A successful copy offers the requested destination only from the returned account-owned records. Arbitrary external redirects, malformed/oversized continuation identifiers and additional continuation query/hash values are rejected by the return-path validator.

No records, passwords, email codes, document bytes or migration tokens are carried in continuation URLs. Only an application identifier is carried; it does not confer access. Previewing intentionally stages a validated browser snapshot on the authenticated server, using the existing explicit preview operation. Nothing is assigned automatically on sign-in.

Document storage/scanner code was unchanged. A real browser regression verified that unavailable safety checks preserve upload inputs and publish no document. Signing in is not a guarantee that secure file scanning/upload is operational.

## Screenshots

Authentic captures use isolated synthetic browser contexts. Before: current-source development server. After: rebuilt production server with the dedicated test database and loopback inbox. Desktop 1440×1100; mobile iPhone 13 Chromium viewport 390×664. Browser sandbox enabled. No image editing.

| State                                                               | Evidence                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Before: Offer Desk boundary and sign-in, both themes/widths         | [Before captures](../.fats-private/f02/SCREENSHOTS.md#before)     |
| After: contextual sign-in, preview, success and returned Offer Desk | [After captures](../.fats-private/f02/SCREENSHOTS.md#after)       |
| Empty browser, interrupted copy and saved-copy/refresh failure      | [Recovery captures](../.fats-private/f02/SCREENSHOTS.md#recovery) |

Screenshots and traces remain local and Git-ignored. Inspected representative desktop success and mobile preview/sign-in renders, including focus rings, wrapping and retained FATS styling. Automated journeys check mobile document overflow and keyboard confirmation/focus. This is not a full assistive-technology audit.

## Executed verification

Node 24.21.0; pnpm 11.27.0; Next.js 16.4.1. Isolated loopback ports 3198/3199, dedicated `_test` PostgreSQL on 16432, synthetic Mailpit on 18025. Live AI disabled; no paid AI calls.

| Check                                                                                             | Actual result                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck`                             | **PASS**, four projects. Final test additions also passed tools TypeScript; reviewed authentication-link source passed production build type checking.                                                                  |
| Lint: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`                                        | **PASS**, four projects. Final changed auth/test files also passed scoped ESLint.                                                                                                                                       |
| Production build: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build`                           | **PASS**, final reviewed source. Existing scanner filesystem tracing warnings remain.                                                                                                                                   |
| Serial unit suite: `pnpm test -- --no-file-parallelism` with Nx socket flags and live AI disabled | **FAIL**, **310/311 pass**. Only the separately known matching-plan hash assertion fails. All new continuation and existing transfer/scanner tests pass.                                                                |
| Focused URL/transfer units                                                                        | **PASS**, **22/22**.                                                                                                                                                                                                    |
| Real PostgreSQL authorization/transfer selection                                                  | **PASS**, **5/5**; ten other cases deliberately unselected. Owner isolation, consent/stage binding, conflicts, empty/identical inputs, cancellation, expiry/stale revisions, retries and actual write-failure rollback. |
| Focused F02 production browser journeys                                                           | **PASS**, **12/12**, final reviewed build; both widths and both themes.                                                                                                                                                 |
| Existing account production browser regressions                                                   | **PASS**, **8/8 selected cases**, across desktop/mobile: guest/account identity, explicit transfer with interviews/lost-response retry, cross-account isolation and scanner-unavailable upload protection.              |
| Existing guest production browser regressions                                                     | **PASS**, **18/18**: application CRUD, every status, persistent filters/navigation, keyboard form behavior, write failures, corrupted storage and honest empty states.                                                  |
| Formatting / diff / preserved work                                                                | **PASS**, repository formatting and diff checks. Moodboard SHA-256 checks pass for all four PNGs; F04 application-detail and prior account-test changes match their preflight copies.                                   |

The new F02 browser cases cover new registration and verification interrupted by reload; guest with/without applications; an existing account with its own data; cancelled previews; initially disabled confirmation; Space/Tab/Enter and post-submit focus; failure before commit; lost response after commit; repeat previews/confirmation; expired-session reauthentication; successful copy with failed view refresh; final Offer Desk navigation and reload; both widths/themes; unchanged browser originals; and already-signed-in continuation.

Initial checks were investigated, not hidden: the first unit run also caught a new invalid-path normalization expectation, then the validator was corrected and the final unit run has only the known matching failure. The first browser attempt passed 2/8; four cases used an artifact built before the focus refinement and two fixtures had not selected Offer status. After rebuilding/correcting those, a combined account run passed 13/18; five mobile registrations could not sign in because the existing shared 20-per-minute sign-in limit returned **429**. No rate limit, scanner gate or authorization check was disabled or cleared. The focused rerun starts after the ordinary throttle window expires.

Reproducible browser/database commands:

```sh
pnpm db:test:up
pnpm mail:test:up
FATS_TEST_PORT=3199 FATS_TEST_PRODUCTION=1 pnpm test:e2e:account tests/account-e2e/guest-continuity.spec.ts --output=.fats-private/f02/verified-continuity
FATS_TEST_PORT=3198 FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/applications.spec.ts tests/e2e/application-filters.spec.ts --output=.fats-private/f02/final-guest
node --env-file-if-exists=.env.phase4-test node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/postgres.test.ts -t 'rejects unauthenticated|previews and copies|skips identical|requires confirmation|rolls back related'
```

Existing account selection used `accounts.spec.ts` and `document-intake.spec.ts`, filtering `guest identity becomes|explicit browser migration|invalid login stays useful|unavailable safety checks`. Raw commands/results are in `.fats-private/f02/*.log`.

## Separate existing regression and limitations

The matching comparison plan expects extraction SHA-256 `23dd7d8ab99e4ab156686f9cb340b7a2d709a581f9d4b4acb8d2fa3417872bcb`; both `HEAD` and the unchanged working-tree `resume-extraction.ts` hash to `f6792e8725904e8021749c3a2ba2303ebaf0775ba378d9c3c52bbb6c27da8973`. F02 changes neither that source nor the frozen expectation. Existing framework scanner tracing warnings and the ESLint Pages-directory diagnostic remain separate from this milestone.

- Transfer is the established complete applications/interviews snapshot, not selected-record merging. Conflicts require deliberate recovery; the UX does not silently resolve them.
- Browser originals remain independent after transfer. Subsequent guest/account edits do not sync. Clearing site data, a different origin/browser or unreadable storage cannot be repaired by this continuation screen.
- Explicit preview consent is intentionally not persisted through reload, session interruption or account changes. Re-preview is safe but adds a deliberate step after interruption. The final continuation requires the requested record in the confirmation result; missing/deleted records lead to account-list recovery.
- This milestone carries the Offer Desk application destination. General password-reset email destinations and unrelated account-only workflows retain their existing behavior. A user who leaves for a separate password-recovery journey can return through the original guest application; browser records remain intact. F06 list-query forwarding is unchanged; this Offer Desk continuation carries only the application identifier.
- Physical devices, screen readers, the complete extension/browser suite and live AI are **NOT RUN**. Browser coverage uses Chromium and synthetic accounts only. Operational scanner availability and the previously documented unrelated dependency advisories are not remediated here.

No new unresolved ownership or transfer-security issue was identified by these checks. This is scoped evidence, not a complete security audit. No deployment, commit or push.
