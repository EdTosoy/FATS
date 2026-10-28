# Hallmark F01 — guest identity

28 October 2026. Scope: guest identity only; no dashboard redesign.

## Experience

Guests now see **“Welcome to your workspace.”**, **“Guest workspace”**, and: “Your work is saved in this browser, not an account. Clearing site data removes it.” The existing sidebar uses a neutral person icon and browser-storage label; Settings explains guest use instead of introducing Maria Santos. No banners, cards, styles, dependencies, or controls were added.

Authenticated users retain their first-name greeting, full-name sidebar profile, account label, and account Settings. Identity comes from the existing account context. Authentication, ownership, migration, persistence adapters, and document boundaries were not modified.

## Preflight

Read repository/web instructions, the installed Hallmark skill, and `/tmp/fats-hallmark-review-package/{ORIGINAL_AUDIT,DECISION_BRIEF}.md`. Hallmark treats this focused edit as work within the existing design system, rather than a full redesign run. Git initially clean. Fresh current-source development captures reproduced “Hello, Maria.” and the sample profile at desktop/mobile widths in light/dark themes: **4/4 baseline tests passed**. These establish current behavior independently of the audit’s older build.

## Verification

Node 24.21.0; pnpm 11.27.0; repository Playwright/Chromium with its sandbox enabled. Isolated contexts, loopback ports 3191/3192, dedicated `_test` PostgreSQL and test Mailpit. AI disabled; no live provider requests.

| Check                                                     | Actual result                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck` | **PASS**, all four projects; domain/extension cached. Final test edits also passed `pnpm exec tsc -p tsconfig.tools.json --noEmit`.                                                                        |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`      | **PASS**, all four projects; domain/extension cached. Corrected test files also passed scoped ESLint.                                                                                                      |
| `pnpm format:check`                                       | **PASS**.                                                                                                                                                                                                  |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build`     | **PASS** on retry after the framework advisory; current source compiled, typechecked, and prerendered.                                                                                                     |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test`      | **FAIL**: 305/309 passed; one existing hash mismatch and three document-worker failures.                                                                                                                   |
| `pnpm exec vitest run --no-file-parallelism`              | **FAIL**: 308/309 passed; all document tests passed, only the existing hash mismatch remains.                                                                                                              |
| Guest development browser selection¹                      | 29/32 passed initially. Two new-test keyboard-sequence errors corrected; one mobile write-failure test was blocked by the development overlay (trace shows `nextjs-portal` intercepting clicks).           |
| Final production guest selection²                         | **PASS**, 6/6: corrected identity journeys in both themes and the write-failure regression, each at both widths.                                                                                           |
| Production account selection³                             | Four existing transfer/isolation journeys passed. The new identity test initially had an ambiguous email locator; corrected scope and reran: **PASS**, 2/2 identity journeys, each exercising both themes. |
| `git diff --check`; moodboard SHA-256 comparison          | **PASS**; all three original moodboards and the additional brand board unchanged.                                                                                                                          |

Browser commands used the repository configs:

```sh
# ¹ Guest development selection
FATS_TEST_PORT=3191 pnpm exec playwright test tests/e2e/guest-identity.spec.ts tests/e2e/applications.spec.ts tests/e2e/theme.spec.ts tests/e2e/momentum.spec.ts --output=.fats-private/guest-identity/after-guest
# ² Final production guest verification
FATS_TEST_PORT=3191 FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/guest-identity.spec.ts tests/e2e/applications.spec.ts --grep 'guest identity|failed browser writes' --output=.fats-private/guest-identity/after-production
# ³ Real account, transfer, and isolation checks
FATS_TEST_PORT=3192 FATS_TEST_PRODUCTION=1 pnpm test:e2e:account --grep 'guest identity becomes|explicit browser migration|momentum stays separate' --output=.fats-private/guest-identity/after-account
FATS_TEST_PORT=3192 FATS_TEST_PRODUCTION=1 pnpm test:e2e:account --grep 'guest identity becomes' --output=.fats-private/guest-identity/after-account-final
```

Observed: empty guest storage remains empty; saving through the form survives reload; the storage explanation stays above the fold; returning guests remain neutrally identified; keyboard menu opening, Escape/focus return, sign-in and return navigation work. Browser data stays byte-identical across navigation and real sign-in/sign-out. Verified account users see “Hello, Test.”, their full name/account Settings, and separate account records. Explicit transfer still requires preview/confirmation. Guest checks collected page/console errors; account checks collected page errors. None were reported in the final identity journeys. No horizontal overflow in checked identity layouts.

## Unrelated existing failure and diagnostics

`matching-comparison-plan.test.ts:39` expects extraction source hash `23dd7d8…`; HEAD and the working tree both contain `f6792e8…`. The test, plan, and extraction source are unchanged, establishing the mismatch predates F01. No matching files or frozen expectations were repaired. Parallel document-worker contention was absent in the serial run.

Next.js emitted a security upgrade advisory and initially stopped development/build commands; retries succeeded without dependency changes. The build also emitted two dynamic-filesystem tracing warnings in unchanged `document-scanner.ts`; lint emitted the existing Pages-directory diagnostic. These remain separate from F01.

## Screenshots and limits

[All 28 captures](../.fats-private/guest-identity/SCREENSHOTS.md): empty/returning guests, guest Settings, and authenticated dashboard/Settings in both themes. Desktop: 1440×1100; mobile: 390×664 CSS pixels. Baselines use the fresh pre-edit development build and include its issue badge; final images use the rebuilt production app. Inspected rendered headings, copy wrapping, profile, Settings, themes, and representative populated/account states.

| Guest dashboard | Before                                                                                   | After                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Desktop light   | [Open](../.fats-private/guest-identity/screenshots/before-desktop-guest-empty-light.png) | [Open](../.fats-private/guest-identity/screenshots/after-desktop-guest-empty-light.png) |
| Desktop dark    | [Open](../.fats-private/guest-identity/screenshots/before-desktop-guest-empty-dark.png)  | [Open](../.fats-private/guest-identity/screenshots/after-desktop-guest-empty-dark.png)  |
| Mobile light    | [Open](../.fats-private/guest-identity/screenshots/before-mobile-guest-empty-light.png)  | [Open](../.fats-private/guest-identity/screenshots/after-mobile-guest-empty-light.png)  |
| Mobile dark     | [Open](../.fats-private/guest-identity/screenshots/before-mobile-guest-empty-dark.png)   | [Open](../.fats-private/guest-identity/screenshots/after-mobile-guest-empty-dark.png)   |

Evidence is local and Git-ignored. Keyboard/viewport checks establish focused accessibility behavior; screen readers, real devices, and usability validation with graduates were **NOT RUN**. The full browser suite was deliberately **SKIPPED** in favor of affected guest/account journeys. Test services were stopped after verification. No document-security changes, AI requests, deployment, commit, or push.
