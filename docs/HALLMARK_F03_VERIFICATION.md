# Hallmark F03 — first-use dashboard refinement

28 October 2026. F03 and dashboard typography from F09 only.

## Preflight and problems addressed

F01 is committed as `29bffbc` (`fix(ux): clarify guest workspace identity`). Git was initially clean. Read repository/web instructions, the Hallmark audit and decision brief in `/tmp/fats-hallmark-review-package`, and [F01 verification](HALLMARK_F01_VERIFICATION.md). Inspected the dashboard source and authentic production renders before editing product code.

The current baseline reproduced four zero-stat cards, empty interview/recent-application panels, empty Momentum, and two save actions. Guidance used 9–13px text and tracked uppercase labels. Baseline guest journeys passed 4/4; the populated-account baseline passed 2/2 after correcting the new fixture’s status locator and required meeting URL.

## UX decisions

- **One first action.** With zero applications, keep “Save your first job” in the existing guidance card. Hide the duplicate header action on this route and explain the value: saving job details, tracking where you applied, and keeping next steps together.
- **Reveal summaries when useful.** Hide statistics, interview/recent panels, document prompts, and empty Momentum on the empty dashboard. A plain sentence explains what will appear after saving. No new card or widget. Navigation and saving on other routes remain available.
- **Preserve returning workflows.** Once applications exist, retain all four statistics, recent records, interview scheduling, offer/document guidance, header saving, and Momentum. Existing next-action priority remains interview preparation, saved-job review, then application review. An Interview status still does not imply a scheduled date.
- **Readable supporting text.** Dashboard labels use sentence case without tracking. Guidance is 14px, support/record labels at least 13px, and section headings 16px. Styles are scoped to `.dashboard`; existing palette, focus, typography family, spacing system, navigation, and responsive breakpoints remain.
- **Preserve F01 and data boundaries.** Guest identity/storage copy and authenticated names remain. Composition derives from application count, with no new first-visit flag or storage writes. Domain rules, authentication, ownership, migration, documents, and dependencies are unchanged.

## Before/after evidence

[All 24 screenshots, paired by state, viewport, and theme](../.fats-private/f03/SCREENSHOTS.md). Both sides use freshly built production apps, isolated guest contexts or synthetic verified accounts. Desktop: 1440×1100; mobile: 390×664 CSS pixels. Populated accounts contain two applications and one scheduled interview.

| Example                          | Before                                                                              | After                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Empty guest, desktop/light       | [Open](../.fats-private/f03/screenshots/before-desktop-guest-empty-light.png)       | [Open](../.fats-private/f03/screenshots/after-desktop-guest-empty-light.png)       |
| Empty guest, mobile/dark         | [Open](../.fats-private/f03/screenshots/before-mobile-guest-empty-dark.png)         | [Open](../.fats-private/f03/screenshots/after-mobile-guest-empty-dark.png)         |
| Returning guest, mobile/light    | [Open](../.fats-private/f03/screenshots/before-mobile-guest-returning-light.png)    | [Open](../.fats-private/f03/screenshots/after-mobile-guest-returning-light.png)    |
| Populated account, desktop/light | [Open](../.fats-private/f03/screenshots/before-desktop-account-populated-light.png) | [Open](../.fats-private/f03/screenshots/after-desktop-account-populated-light.png) |
| Populated account, mobile/dark   | [Open](../.fats-private/f03/screenshots/before-mobile-account-populated-dark.png)   | [Open](../.fats-private/f03/screenshots/after-mobile-account-populated-dark.png)   |

Inspected actual empty, returning, and populated account images for hierarchy, wrapping, identity, and theme behavior. First-save action is visible in the initial viewport. Populated layouts retain their information, with additional vertical space for readable text.

## Executed verification

Node 24.21.0, pnpm 11.27.0; repository Playwright/Chromium with sandbox enabled. Browser tests used loopback ports 3193/3194, the dedicated `_test` database and loopback test inbox. AI remained disabled. Nx checks used `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`.

| Command/check                        | Result                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                     | **PASS**, four projects; domain/extension cached. Final test edits also passed `pnpm exec tsc -p tsconfig.tools.json --noEmit`.                                                                                                   |
| `pnpm lint`                          | **PASS**, four projects; domain/extension cached. Final test edits also passed scoped ESLint.                                                                                                                                     |
| `pnpm format:check`                  | **PASS**.                                                                                                                                                                                                                         |
| `pnpm build`                         | **PASS** on retry after the framework advisory; compilation, TypeScript, and prerendering completed.                                                                                                                              |
| `pnpm test -- --no-file-parallelism` | **FAIL**: 308/309 passed. Only the pre-existing matching-plan hash mismatch remains.                                                                                                                                              |
| Production guest selection¹          | **PASS across final runs**: 40/44 passed initially; four new assertions used the wrong existing button name. Corrected “Schedule interview” to “Add interview”; rerun passed 4/4. No product repair was needed.                   |
| Production account selection²        | **PASS**, 8/8; populated-account rerun also passed 2/2 with saved contrast artifacts.                                                                                                                                             |
| Rendered contrast/readability        | **PASS**, 234 measurements across empty/returning guests and populated accounts, both widths/themes: minimum text contrast **4.89:1**, minimum sampled font **13px**. [Measurements](../.fats-private/f03/contrast-summary.json). |
| `git diff --check`; moodboard hashes | **PASS**. Three original moodboards and the additional brand board unchanged.                                                                                                                                                     |

Browser commands (all with `FATS_TEST_PRODUCTION=1`):

```sh
# ¹ Port 3193
pnpm exec playwright test tests/e2e/applications.spec.ts tests/e2e/guest-identity.spec.ts tests/e2e/momentum.spec.ts tests/e2e/theme.spec.ts tests/e2e/interviews.spec.ts --output=.fats-private/f03/after-guest
pnpm exec playwright test tests/e2e/guest-identity.spec.ts --output=.fats-private/f03/after-guest-final
# ² Port 3194
pnpm test:e2e:account --grep 'dashboard preserves populated|guest identity becomes|explicit browser migration|momentum stays separate' --output=.fats-private/f03/after-account
pnpm test:e2e:account --grep 'dashboard preserves populated' --output=.fats-private/f03/after-account-final
```

Covered real form creation → persistence → reload → dashboard; every application status; keyboard modal containment/cancellation/focus return and menu/sign-in navigation; saved-job review; scheduled interview preparation/navigation; multi-tab updates; corrupt storage and failed writes; system/explicit themes; actual verified accounts; unchanged explicit transfer and workspace isolation. Passing journeys reported no collected runtime errors; guest checks also collected console errors. No horizontal overflow in checked layouts, including existing responsive theme journeys at 820, 1366, and 1916px.

**Separate existing regression:** `matching-comparison-plan.test.ts:39` expects extraction hash `23dd7d8…`; unchanged HEAD and working-tree extraction source hash to `f6792e8…`. The test, plan, and source are unchanged. No frozen expectations or matching code were repaired.

## Framework security advisory investigation

The installed/pinned **Next.js 16.4.0** falls within the published affected ranges. The October 14 update patches these issues in **16.4.1** (16.x) and **15.5.28** (15.x). The startup/build reminder checks package-version ranges; continuing after its reminder does not patch anything. [Official update](https://nextjs.org/blog/nextjs-security-update-october-14-2026).

| Advisory                                                                                                                                      | Severity and affected version            | Applicability to this build                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), typed-array `use cache` RCE                 | Critical, CVSS 9.5; Next 16.0.0–16.4.0   | App Router is used, but compiled configuration has `cacheComponents: false` and no application `use cache` functions were found. The documented feature prerequisites were not observed. Upstream still recommends upgrading.    |
| [GHSA-2464-fhr4-w9xw / CVE-2026-96889](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), SVG Image Optimization RCE | Critical, CVSS 9.5; includes Next 16.4.0 | This host uses glibc 2.42. Next resolves **sharp 0.35.5 / librsvg 2.63.2**, meeting the published sharp workaround. SVG allowance is false and remote patterns are empty. This conclusion applies to the inspected installation. |
| [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), Server Actions CPU DoS                      | High, CVSS 8.2; includes Next 16.4.0     | No application `use server` directives were found; compiled Server Action manifests contain zero Node/Edge actions. The documented Server Action prerequisite is absent in this build.                                           |

[Local package/configuration evidence](../.fats-private/f03/security-environment.json). These are source/configuration applicability findings, not exploit testing or a blanket security assessment. The separate [sharp advisory](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w) identifies 0.35.5 and librsvg 2.63.2 as patched. Existing scanner filesystem-tracing build warnings and the Pages-directory lint diagnostic remain outside this UX change.

## Limitations and next milestone

Artifacts are local and Git-ignored. Screen readers, physical devices, complete zoom/accessibility conformance, and graduate usability testing were **NOT RUN**. Contrast checks cover sampled rendered dashboard text, not the whole application. The full browser suite was **SKIPPED** in favor of affected journeys. Other-route typography and broader Momentum changes remain deferred.

Recommended next milestone: a separate dependency-security patch to **Next.js 16.4.1 or a newer supported patched release**, with lockfile review and authentication/document/PDF/browser regression checks. No dependencies were changed here. After that, the audit’s next UX milestone is F04/F06: mobile status placement and persistent application filters.

No domain/authentication changes, new widgets, AI requests, commits, pushes, or deployments.
