# Next.js security patch verification

28 October 2026. Scope: the official October 14 Next.js security update.

## Preflight and change

F03 was **not committed** at task start. HEAD remained `29bffbc` (F01), with the F03 dashboard styles/components, browser tests, readability helper, and report present as uncommitted work. Those files were recorded by SHA-256 and preserved; this task does not create a commit.

Read repository/web instructions, the F03 verification report, installed Next.js upgrade guidance, and the [official October 14 security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026).

The app manifest, pnpm lockfile, and installed app resolution originally used **Next.js 16.4.0**. Upgraded the exact app pin to **16.4.1**, the compatible patched 16.x release named in that update. Node 24.21.0 and React/React DOM 19.3.1 satisfy its published engine/peer ranges. pnpm is 11.27.0.

Executed:

```sh
pnpm --filter @fats/web update next@16.4.1 --save-exact
pnpm install --frozen-lockfile
pnpm --filter @fats/web why next
```

The lockfile changes only Next.js, its matching `@next/env` and platform SWC packages, and Better Auth’s peer-resolution references. Better Auth itself remains 1.7.8. React, sharp, PDF libraries, authentication/mail packages, and other pins are unchanged. `eslint-config-next` remains 16.4.0: it has no Next runtime peer constraint, its existing ESLint/TypeScript peers remain satisfied, and lint passed. No native-build approval or security policy was relaxed.

## Advisory evidence

All three advisories list 16.4.0 as affected and 16.4.1 as patched:

| Advisory                                                                                                                                      | Severity           | Local applicability before patch                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr): typed-array `use cache` RCE                 | Critical, CVSS 9.5 | App Router is used, but Cache Components were disabled and no application `use cache` functions were found during F03. Package version was still affected.                  |
| [GHSA-2464-fhr4-w9xw / CVE-2026-96889](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw): SVG Image Optimization RCE | Critical, CVSS 9.5 | This is glibc Linux. Next already resolved sharp 0.35.5 / librsvg 2.63.2, meeting the documented image-library workaround; the Next package remained in the affected range. |
| [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r): Server Actions CPU DoS                      | High, CVSS 8.2     | Compiled manifests contained no Server Actions during F03, so that prerequisite was absent. Package version was still affected.                                             |

After installation, Node resolution from the web app returns **16.4.1**. `pnpm why next` finds **one Next version**, used by both the app and Better Auth. The production build also identifies itself as 16.4.1. The dependency audit removes exactly these three advisories and introduces none. The build no longer emits the vulnerability upgrade advisory; no reminder suppression, ignored advisory, audit exclusion, or gate bypass was used.

[Resolved dependency evidence](../.fats-private/security-patch/resolved-after.json) · [Dependency graph](../.fats-private/security-patch/why-next.log) · [Audit comparison](../.fats-private/security-patch/audit-comparison.json).

## Verification results

**The three targeted Next.js advisories are remediated in the local dependency graph.** Resolved version, lockfile consistency, targeted audit results, production build, and relevant application/authentication/PDF regressions are verified. The full audit and unit suite retain the separate existing failures below; no deployment is claimed.

| Check                                                                                                              | Actual result                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                   | **PASS**; no lockfile resolution needed, no peer/build-policy conflicts reported.                                                                                                                                                                                                                                                 |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck`                                                          | **PASS**, all four projects.                                                                                                                                                                                                                                                                                                      |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`                                                               | **PASS**, all four projects.                                                                                                                                                                                                                                                                                                      |
| `FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build` | **PASS** on the first patched build; Next.js 16.4.1 compiled/typechecked/prerendered without the security advisory.                                                                                                                                                                                                               |
| Unit suite, serial                                                                                                 | **FAIL**: 308/309 passed; only the unchanged matching-plan hash regression.                                                                                                                                                                                                                                                       |
| PostgreSQL/authentication integration selection                                                                    | **PASS**, 24/24.                                                                                                                                                                                                                                                                                                                  |
| Production guest browser selection                                                                                 | **PASS**, 58/58, desktop/mobile. Includes local PDF filling, marks/signatures, multipage export, original-byte preservation, application CRUD/statuses, persistence, backups, interviews, themes, and production route boundaries.                                                                                                |
| Production account browser selection                                                                               | Initially 20/24 passed. Four recovery tests hardcode Origin port 3000; running on 3196 correctly returned 403 on their workspace writes. The unchanged recovery suite passed **6/6** on its expected port 3000, including reset-email delivery, single-use links, session revocation, record preservation and verification gates. |
| PDF V2 development browser selection                                                                               | **PASS**, 12/12, desktop/mobile: real worker rendering, keyboard controls, signatures, extraction/splitting, merge ordering, exported-byte/pixel checks with existing Poppler 26.06.0, and rejection of real encrypted/signed fixtures.                                                                                           |
| `pnpm format:check`; `git diff --check`                                                                            | **PASS**.                                                                                                                                                                                                                                                                                                                         |
| Existing-work preservation                                                                                         | **PASS**: original F03/source/config/moodboard snapshots remain byte-identical. Six tracked screenshot files regenerated by the existing PDF tests were restored to their original bytes; new captures remain private.                                                                                                            |
| Targeted dependency audit                                                                                          | **PASS**, zero Next.js findings after the patch; all three original Next advisories removed, none introduced.                                                                                                                                                                                                                     |
| Full `pnpm audit --json`                                                                                           | **FAIL**, 22 unchanged findings in other modules, detailed below.                                                                                                                                                                                                                                                                 |

No test assertions, origin checks, ownership rules, scanner gates, or application code were changed. Tests used fresh browser contexts, Chromium sandbox enabled, the dedicated local `_test` database, and a loopback-only synthetic inbox. Recovery traces confirmed POST `/api/workspace` returned 403 on the mismatched test origin. The tests passed when server and fixture origins matched.

Executed regression commands (logs/artifacts under [`.fats-private/security-patch`](../.fats-private/security-patch/)):

```sh
FATS_AI_MATCHING_ENABLED=0 FATS_EVAL_LIVE=0 FATS_COMPARISON_LIVE=0 OPENAI_API_KEY= NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test -- --no-file-parallelism
pnpm test:integration tests/integration/account-safety.test.ts tests/integration/postgres.test.ts
FATS_TEST_PORT=3195 FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/applications.spec.ts tests/e2e/guest-identity.spec.ts tests/e2e/theme.spec.ts tests/e2e/interviews.spec.ts tests/e2e/backups.spec.ts tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts --output=.fats-private/security-patch/production-guest
FATS_TEST_PORT=3196 FATS_TEST_PRODUCTION=1 pnpm test:e2e:account accounts.spec.ts recovery.spec.ts document-intake.spec.ts --grep-invert 'registration, account CRUD' --output=.fats-private/security-patch/production-account
FATS_TEST_PORT=3000 FATS_TEST_PRODUCTION=1 pnpm test:e2e:account recovery.spec.ts --output=.fats-private/security-patch/recovery-default-origin
PDF_TOOLS_POPPLER_BIN=/nix/store/63r5wi3sdvwalqcdibpipnyl35swdzzg-poppler-utils-26.06.0/bin FATS_TEST_PORT=3197 FATS_TEST_PRODUCTION=0 pnpm exec playwright test --config=playwright.pdf-v2.config.ts tests/pdf-v2-e2e/workspace.spec.ts tests/pdf-v2-e2e/quick-sign.spec.ts tests/pdf-v2-e2e/page-outputs.spec.ts tests/pdf-v2-e2e/merge.spec.ts tests/pdf-v2-e2e/security.spec.ts --grep 'real pages, original|keyboard navigation, fit|real Quick Sign exports|extracts noncontiguous|three PDFs with duplicate|real encrypted' --output=.fats-private/security-patch/pdf-v2
```

The excluded account scenario explicitly probes matching endpoints; the other account/integration journeys exercise authentication, owner isolation and persistence without AI calls.

## Outstanding issues and scope limits

The full dependency audit remains nonzero because of unchanged findings outside Next.js: **22 findings: 6 high, 13 moderate, 3 low; zero critical**. The original audit had 25 findings, including two critical and seven high. Existing findings are in:

- `undici 7.29.0`, through the development dependency `nx` (18 findings).
- `nodemailer 10.1.1`, an application dependency (3 moderate findings).
- `fflate 0.8.2`, declared as a web development dependency (1 moderate finding).

These are documented rather than upgraded under this task’s constraint against unrelated dependency changes. This report does not establish that the entire application/dependency tree is vulnerability-free.

The existing matching-plan unit regression remains separate: `matching-comparison-plan.test.ts:39` expects extraction hash `23dd7d8…`, while unchanged HEAD and working-tree extraction source hash to `f6792e8…`. No matching source, plan, or frozen expectation was changed.

The full browser suite, native extension, live provider evaluation, and operational accepted-file scanner journeys were **NOT RUN**; focused application/authentication/PDF suites were selected. Existing scanner filesystem-tracing build warnings and the Pages-directory lint diagnostic remain.

No live AI requests, deployment, commit, or push. Temporary database/inbox services were stopped after verification without deleting their data. Browser contexts and database fixtures are synthetic and isolated; test mail is loopback-only. Successful document intake with an operational scanner is outside this dependency patch; fail-closed behavior is verified without weakening scanner requirements. Exploit payloads were not sent to the application.

## Recommended commit message

```text
fix(security): patch Next.js to 16.4.1
```

Scope that commit to `apps/web/package.json`, `pnpm-lock.yaml`, and this report. The separate uncommitted F03 work remains available for its own review/commit.
