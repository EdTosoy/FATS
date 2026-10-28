# Hallmark F08 — honest document availability

28 October 2026. F08 only: explain available document actions before authentication or file selection.

## Preflight and reproduction

Read repository/web instructions, the Hallmark audit and decision brief, [F02 verification](HALLMARK_F02_VERIFICATION.md), [Documents](DOCUMENTS.md), [Career Vault](CAREER_VAULT.md), and [safe-intake verification](PRIVATE_BETA_HARDENING_2_VERIFICATION.md). Used implementation, visual-iteration and verification skills; reviewed the React changes. Checked installed Next.js 16.4.1 `connection()` documentation before adding request-time capability rendering.

F01 (`29bffbc`), F03 and the security patch (`f20a57e`/`34bdf74`) are committed. **F02, F04 and F06 remain uncommitted.** Their changes were preserved; this task creates no commits.

Fresh baseline tests passed **8/8** across desktop/mobile and light/dark: guest Resumes promised sign-in “to upload”; authenticated Resumes offered an enabled upload button and file chooser despite unavailable scanning. Career Vault and PDF Tools separately described restricted saving. The guest library, account warning and related entry points therefore gave inconsistent expectations.

Before guest captures used the current development server, whose existing account-connection notice is visible in some captures. Before account and all after captures use production servers with isolated test configuration. Removal of that unrelated connection notice in after captures is not an F08 change.

## Implementation

- **One existing capability source.** A small server helper calls `ClamavDocumentScanner.health()` and returns only a boolean, failing closed on errors. `/resumes` awaits Next.js `connection()` before checking, so build-time scanner availability is not frozen into the page. No duplicate feature flag, capability database, public diagnostic endpoint or clean-scan substitute was added.
- **Explain before sign-in or selection.** Resumes shows a plain paragraph before its guest account prompt: new uploads are unavailable while required checks are not ready, signing in does not remove the restriction, and local editing/downloading remains available. It suggests retaining files and reloading to check again. The authenticated view uses the same result.
- **Consistent upload controls.** Header upload, first-resume upload, Add version and form submission use the same capability prop. Restricted actions are disabled; the header/empty-state actions reference the visible explanation. A previously opened form can retain its inputs when the prop becomes restricted. No file is selected or uploaded just to discover the normal unavailable state.
- **Keep useful actions.** Existing library metadata/history controls remain usable. Authorized accepted-file access retains its existing checks. PDF Tools still edits in browser memory and downloads locally; its copy explicitly says it does not save the edited copy into an account or Career Vault. Career Vault distinguishes employment/document notes from file uploads and links to existing accepted versions when available.
- **Honest invitations elsewhere.** Dashboard and submitted-resume prompts now lead to document options/library availability rather than promising a first upload. Offer Desk and its contextual sign-in copy explain that new letter uploads also require available safety checks, preserving the F02 continuation and consent flow.

The existing warning presentation becomes ordinary guidance; no additional banner, card, navigation, dependency or PDF-engine change. Existing FATS tokens, layout, native controls and focus indicators remain.

## Security boundaries

The capability boolean is advisory, never permission. Every upload still passes live account ownership, bounded admission, private quarantine, the real scanner, structural validation, quotas and immutable publication. Download/preview/link routes still require owner authorization and accepted evidence for the exact bytes. Scanner, intake, storage, authentication and domain implementations are unchanged.

The unavailable-scanner browser regression now verifies the improved behavior **before** opening a form, then deliberately sends a synthetic direct PUT to prove the underlying endpoint still returns **503** and publishes neither a version nor an object. The legacy/quarantine regression still rejects downloads/previews, checks blocked new versions, successfully edits existing metadata, and verifies protected account erasure. This replaces the old expectation of discovering the restriction only after filling an upload form.

## Screenshots and observed behavior

[Before/after gallery and exported PDF artifacts](../.fats-private/f08/SCREENSHOTS.md). Evidence remains local and Git-ignored; images are unedited synthetic captures. Desktop 1440×1100; mobile Chromium/iPhone 13 viewport 390×664, both themes.

Inspected the before mobile library and after guest mobile library, dark desktop account library and dark mobile Career Vault. Restrictions precede the guest sign-in action, the account upload action is visibly disabled, and local PDF actions remain prominent. Tests exercise keyboard focus/Enter, accessible control labels/descriptions, dialog behavior and narrow-screen overflow. This is not a complete accessibility audit.

## Executed results

Node 24.21.0, pnpm 11.27.0, Next.js 16.4.1. Chromium sandbox enabled. Synthetic accounts/documents only, dedicated local `_test` PostgreSQL and loopback Mailpit. AI disabled; no AI provider requests, ClamAV installation or signature downloads.

| Check                                                                             | Result                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck`                         | **PASS**, four projects.                                                                                                                                                                                                           |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`                              | **PASS**, four projects.                                                                                                                                                                                                           |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build`                             | **PASS**; `/resumes` is request-rendered. Existing scanner filesystem-tracing warnings remain.                                                                                                                                     |
| Serial `pnpm test -- --no-file-parallelism`, Nx socket flags and live AI disabled | **FAIL**, **312/313 pass**. Both new availability tests and existing document/scanner units pass; only the separate matching-plan hash assertion fails.                                                                            |
| Existing document authorization/intake integrations                               | **PASS**, **3/3 selected**, 11 unselected. Ownership/access, unavailable/error/timeout/detection rejection, and actual default-scanner missing-configuration refusal.                                                              |
| Guest availability and local PDF browser tests                                    | **PASS**, **8/8**. Both themes/widths; sign-in boundary, keyboard local entry, actual form/mark editing and multi-page export, original-file preservation, unsupported-file/dirty-state behavior. No upload writes.                |
| Account/document/F02/dashboard browser selection                                  | **PASS**, **12/12**. Both themes/widths; sign-in returns to restricted library, all initial upload actions disabled, native API refusal, legacy/quarantine protections, metadata edits and existing account guidance/continuation. |
| Career Vault metadata browser regression                                          | **PASS**, **2/2**. Employment/document records persist with draft recovery and immutable history, without uploading a file.                                                                                                        |
| Formatting / diff / moodboards                                                    | **PASS**, repository Prettier check, diff check and all four preflight moodboard hashes.                                                                                                                                           |

Commands and raw logs are in `.fats-private/f08/`:

```sh
FATS_CLAMAV_DATABASE_DIR= FATS_TEST_PORT=3198 FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/document-availability.spec.ts tests/e2e/pdf-tools.spec.ts --output=.fats-private/f08/after-guest
FATS_TEST_PORT=3199 FATS_TEST_PRODUCTION=1 pnpm test:e2e:account tests/account-e2e/document-availability.spec.ts tests/account-e2e/document-intake.spec.ts tests/account-e2e/guest-continuity.spec.ts tests/account-e2e/accounts.spec.ts --grep 'signing in preserves|unavailable safety checks block|legacy files cannot|light: new registration retains|dashboard preserves populated' --output=.fats-private/f08/after-account
FATS_TEST_PORT=3199 FATS_TEST_PRODUCTION=1 pnpm test:e2e:account tests/account-e2e/career-vault.spec.ts --grep 'records a first job' --output=.fats-private/f08/vault-regression
node --env-file-if-exists=.env.phase4-test node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts tests/integration/document-intake.test.ts tests/integration/documents.test.ts -t 'fails closed on unavailable|default scanner rejects|authorizes live verified owners'
```

Integration promotion/ownership cases use the repository's injected synthetic scanner fixtures, not actual malware detection or a production bypass. Browser/default-scanner cases exercise real fail-closed behavior. Correction to F02's environment note: the existing account global setup clears **test-only** rate-limit records before each run; configured runtime limits remain enabled. Neither the setup nor the limits were changed here.

## Separate failure and limitations

- The matching plan still expects extraction hash `23dd7d8ab99e4ab156686f9cb340b7a2d709a581f9d4b4acb8d2fa3417872bcb`. Both `HEAD` and the unchanged extraction source hash to `f6792e8725904e8021749c3a2ba2303ebaf0775ba378d9c3c52bbb6c27da8973`. No matching repair is included.
- Availability is a scanner-health snapshot when the library renders. Reload checks again; a healthy snapshot does not guarantee acceptance, storage configuration, format validity, quota or future scanner health. The API rechecks every intake. No independent persisted UI flag exists.
- Actual configured-scanner success, clean/malicious detection and the browser transition from healthy scanning to restricted scanning are **NOT RUN**. The helper's healthy/failing transitions are unit-tested; real scanner operation remains separately authorized work. An already-open upload form's failure preservation was not re-exercised with a real healthy scanner in this milestone.
- Physical devices, screen readers, the full extension/browser suite and live AI are **NOT RUN**. Existing accepted-file access is covered by integration fixtures; this task does not certify operational antivirus or remove the prior real-data readiness restriction.

No commit, push or deployment. No scanner installation/bypass or new upload capability.
