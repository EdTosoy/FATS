# Phase 4.1 — account safety and recovery

Implemented locally on 2026-10-15 with Node 24.21.0, pnpm 11.27.0, Better Auth 1.7.8, Next.js 16.4.0, PostgreSQL 17, Mailpit v1.31.6, and system Chromium. The repository started with staged Phase 3/4 work; that work and the index were preserved. No commit, push, external publication, cloud deployment, resume feature, AI feature, or Phase 5 work was performed.

## Decisions and compatibility

Retain the existing Next Node API, PostgreSQL adapter, and account ownership boundaries. [ADR 0002](decisions/0002-account-safety-and-recovery.md) documents the supported authentication choices, local mail, archive format, and restore safety. No schema change is required: the existing three migrations already provide the verified-email field, verification storage, rate limits, sessions, and workspace tables. Their contents/checksums remain unchanged.

Require email verification for new and existing accounts. Existing account records are retained; previously unverified sessions receive a verification gate, and the server denies account workspace reads/writes until verification. Guest records, additive browser migration, version 1 JSON exports/confirmed restore, interview rules/timezones, and the Sidekick confirmation flow remain available. There is no silent verification or data deletion. Public recovery screens operate independently of workspace loading/expiration.

Better Auth's default email-link verification uses a stateless signed token and can return success for replay after verification. Its supported email OTP plugin provides the database-backed atomic consumption required here. Configure eight-digit codes, 10-minute expiry, five attempts, hashed code/identifier storage, and rotation on resend. Expose only the required verification endpoints; OTP sign-in, OTP lookup, alternate recovery, and account-change endpoints remain inaccessible. Verification never creates a session automatically.

Password recovery uses the library's supported 30-minute reset tokens and transactional password update, token consumption, and revocation of all sessions for that account. No custom authentication cryptography was added. Reset email links use `/reset-password#token=...`; the client removes the fragment from history after mounting and submits the token only in the same-origin JSON body. Token-bearing library GET callbacks are not exposed. Invalid, expired, consumed, and concurrent second-use tokens fail safely.

Nodemailer 10.1.1 is the narrowly justified SMTP dependency, with pinned types/lockfile. It sends only to loopback Mailpit, with protocol/content logging disabled and fixed safe failure messages. Only SMTP delivery runs asynchronously; library token persistence stays awaited inside its transaction. This distinction fixed an observed library background-task interaction that initially prevented registration codes from being stored/sent. There is no production provider, real recipient delivery, paid credential, custom SMTP protocol, or durable mail queue.

## Security review and changes

| Boundary         | Result                                                                                                                                                                                                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessions         | Seven-day lifetime, daily refresh, database validation without cookie caching; logout revokes that session; password reset revokes every session for the account transactionally. Other accounts retain access.                                                                                                                                           |
| Cookies          | HTTP-only, SameSite=Lax, path `/`; Secure on HTTPS. Actual library HTTPS-cookie configuration is integration-tested. Loopback HTTP is development-only.                                                                                                                                                                                                   |
| CSRF/origin      | Existing exact Host/Origin and Fetch Metadata checks retained. JSON-only writes, bounded bodies, no forwarded-host/IP trust, no arbitrary callback URLs forwarded.                                                                                                                                                                                        |
| Ownership        | Live session supplies owner; verified-email check precedes every workspace operation. Existing owner-scoped queries and composite foreign keys preserved.                                                                                                                                                                                                 |
| Enumeration      | New/duplicate signup and known/unknown email requests return the same generic success shape. Unknown/wrong-password/unverified login failures share status/message. Invalid/expired/exhausted verification failures share status/message. A 500 ms request floor reduces obvious email-request timing differences; this is not a constant-time guarantee. |
| Rate limits      | Library database-backed shared per-path buckets: resend and reset request 3/minute; code verification 30/minute plus 5 attempts/code; reset submission 10/minute; signup 30/minute; password login 20/minute. The UI also has a resend cooldown. Local requests share limits because no reverse proxy is trusted.                                         |
| Sensitive output | Library and SMTP content logging disabled; email failures emit only a fixed message. PostgreSQL utilities do not inherit diagnostic output; only safe failure text/SQLSTATE is retained. Session API output is limited to public user fields.                                                                                                             |
| Configuration    | Private environment files remain ignored; no new production secrets. Runtime service initialization rejects hosted application origins while email delivery is local-only. Separate synthetic-account inbox/database ports isolate tests from developer records.                                                                                          |

## Operational backup and recovery

[DATABASE_RECOVERY.md](DATABASE_RECOVERY.md) contains exact operator commands and failure/recovery guidance. `db:backup` creates a PostgreSQL custom archive and private manifest from one exported repeatable-read snapshot. The manifest records PostgreSQL major, exact migration checksums, archive SHA-256, and account/application/interview counts. Outputs use exclusive filenames and mode 0600; backup directories are created privately. Dumps/manifests/backups are Git-ignored. Checksums detect damage, not authorship: only restore trusted files.

Restore requires an independently configured `FATS_RESTORE_DATABASE_URL`, explicit container/database/file, and exact `RESTORE <database>` confirmation. There is no fallback to the backup source URL. Preview checks the actual local container/port/database identity and compatible archive without writes. Restoration rejects system/remote/unrelated/in-use targets and incompatible/incomplete archives. Stop the application throughout the operation.

Schema/data replacement, count/ledger checks, and deletion of restored sessions, verification/reset tokens, and staged workspace previews run in one PostgreSQL transaction. A deliberately wrong manifest count caused a failure after schema/data replacement began; the test confirmed complete rollback, retaining the destination's later edit and existing sessions. Actual successful restore verified all application/interview fields, relationships, password login, migration ledger, and revoked sessions/recovery state. The source database was unchanged.

The supported wrapper is deliberately local PostgreSQL 17, using the checked-in Compose service or labelled disposable database. It requires the exact code migration revision. Archives contain password hashes and private data; they are not encrypted or automatically copied off-device. This proves local restore behavior, not hosted disaster recovery. User-level JSON exports still contain only one workspace's records and exclude credentials/sessions.

## Executed verification

Nx commands used `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`; `--skip-nx-cache` forced applicable quality checks. Local Docker/socket/build/browser operations ran with scoped environment permission. Chromium's sandbox remained enabled. Tests used synthetic `@example.test` accounts and disposable databases/inboxes, never a user's workspace.

| Exact command/scenario                                                                                                                                                                                                                 | Result | Evidence                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --offline`                                                                                                                                                                                             | PASS   | Lockfile unchanged, cached pinned packages reproduced, 1.2 s. No new native build approvals.                                                                                                                        |
| `pnpm db:test:up`                                                                                                                                                                                                                      | PASS   | Separate PostgreSQL 17 container, loopback 16432, ignored private test environment.                                                                                                                                 |
| `pnpm mail:test:up`                                                                                                                                                                                                                    | PASS   | Separate Mailpit inbox 18025, SMTP 11025; readiness checked.                                                                                                                                                        |
| `pnpm db:up` plus `GET http://127.0.0.1:8025/readyz`                                                                                                                                                                                   | PASS   | Both development services healthy; inbox bound to loopback. No developer records modified.                                                                                                                          |
| `pnpm test:integration`                                                                                                                                                                                                                | PASS   | 3 files, 29 tests, 36.99 s; actual PostgreSQL, including 5 archive/restore tests.                                                                                                                                   |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test --skip-nx-cache`                                                                                                                                                                   | PASS   | 9 files, 152 unit tests. Domain rules, validation, guest storage, backups, capture, migration and safe account return paths.                                                                                        |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test:e2e`                                                                                                                                                                               | PASS   | 40 desktop/mobile guest tests, 2.1 min. Applications, all statuses, interviews/timezones, backups, corrupt storage, write failures, navigation and web Sidekick.                                                    |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test:e2e:account`                                                                                                                                                                       | PASS   | 16 desktop/mobile account/recovery tests, 1.6 min; real SMTP and PostgreSQL.                                                                                                                                        |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test:e2e:account tests/account-e2e/recovery.spec.ts`                                                                                                                                    | PASS   | Final 6 recovery cases after reset-link initialization change, 37.0 s, including no browser hydration errors.                                                                                                       |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test:extension:account`                                                                                                                                                                 | PASS   | Extension build/package verification and 9 real Chromium extension journeys, 43.1 s; original 8 cases plus verification/sign-in/handoff/PostgreSQL/logout recovery.                                                 |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck --skip-nx-cache`                                                                                                                                                              | PASS   | All 4 projects, 9.9 s.                                                                                                                                                                                              |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint --skip-nx-cache`                                                                                                                                                                   | PASS   | All 4 projects, 7.3 s, zero lint errors/warnings. Next's existing informational pages-directory message remains.                                                                                                    |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build --skip-nx-cache`                                                                                                                                                                  | PASS   | Optimized Next production build and dependency build, 13.5 s.                                                                                                                                                       |
| `node --env-file=.env.phase4-test apps/web/scripts/database.mjs backup --container fats-phase4-tests --database fats_phase4_test --file /tmp/fats-phase41-cli.dump`                                                                    | PASS   | Actual CLI archive/manifest created privately from synthetic accounts; no source replacement.                                                                                                                       |
| `node --env-file=/tmp/fats-phase41-restore.env apps/web/scripts/database.mjs restore --container fats-phase4-tests --database fats_phase41_cli_restore_test --file /tmp/fats-phase41-cli.dump --check`                                 | PASS   | Compatibility and actual target identity checked without writes. Target URL loaded from a private mode-0600 file.                                                                                                   |
| Same restore command with `--confirm 'RESTORE fats_phase41_cli_restore_test'` in place of `--check`                                                                                                                                    | PASS   | Real transactional CLI restore into a separately created disposable database. That database was removed after the drill.                                                                                            |
| `FATS_MAIL_PORT=11025 node --env-file=.env.phase4-test apps/web/node_modules/next/dist/bin/next start apps/web --hostname 127.0.0.1 --port 3000` followed by `node --env-file=.env.phase4-test /tmp/fats-phase41-production-smoke.mjs` | PASS   | Built server plus synthetic HTTP/API/SMTP smoke: seven page routes, unauthorized access, signup, verification/replay, HTTP-only cookies, save, reset/replay, session revocation, preserved record, re-login/logout. |

Additional final checks: **PASS** `pnpm format:check`; **PASS** `git diff --check` and all new-file whitespace checks; **PASS** actual developer/test secrets absent from changed/new files; **PASS** synthetic verification codes/reset tokens absent from 13 verification logs; **PASS** archive/manifest/interrupted-partial/environment ignore checks. SHA-256 comparisons confirmed all four `uiux/*.png` match HEAD and all three existing SQL migrations match the staged Phase 4 baseline.

Integration cases include registration/login/logout/expiration, unauthorized and cross-user access, application/interview CRUD and referential integrity, empty/checksummed migration correctness, local transfer/duplicate/lost-response safety, backup replacement rollback, verification expiry/replay/concurrent consumption/resend/attempt limits, enumeration response equality, invalid/expired reset, concurrent single-use reset, all-session invalidation, password-update failure rollback, and safe origin/endpoint/logging behavior.

Browser recovery cases cover incorrect verification codes, cooldown and keyboard focus, verified status, actual email reset, password confirmation errors, token URL/history privacy, consumed-link errors, retained saved records, existing unverified account recovery, and public recovery after session expiration. Desktop/mobile screenshots were inspected: no horizontal overflow, visible labels/focus/error states, established FATS colors/components, and no passwords/codes/reset tokens shown. Screenshots contain only synthetic identities and remain in ignored `test-results/`.

The first guest run inherited the developer's localhost auth origin while testing 127.0.0.1, producing console/network failures. The guest test server now explicitly disables account environment variables and refuses reuse; the complete rerun passed. Early restore checks also exposed an incorrect account-table mapping and PostgreSQL's cleared search path; both were corrected before the successful real restore. A reset-page browser-state initialization lint failure was corrected, then lint and the six recovery browser cases passed. These were implementation/configuration defects resolved in this phase, not waived failures.

The account extension command includes the package build/verifier and the eight original guest extension cases, so a separate identical guest-extension run was not needed. Browser suites and the production server ran sequentially. Module-level auth integration tests inject a deterministic mail sink while retaining the actual auth library/PostgreSQL; browser/production checks exercise real SMTP delivery. The temporary production smoke script, private environment files, archives, and test screenshots are local verification artifacts, not shipped application files.

## Files changed

These 51 paths are the Phase 4.1 delta relative to the pre-existing staged Phase 4 baseline. Earlier staged Phase 3/4 files are not counted as new work here. No extension runtime or domain schema file changed.

```text
.gitignore
.prettierignore
AGENTS.md
README.md
docs/LOCAL_CONFIGURATION.md
apps/web/package.json
apps/web/scripts/database.mjs
apps/web/scripts/mail-test.mjs
apps/web/src/app/forgot-password/page.tsx
apps/web/src/app/globals.css
apps/web/src/app/help/page.tsx
apps/web/src/app/layout.tsx
apps/web/src/app/reset-password/page.tsx
apps/web/src/app/sign-in/page.tsx
apps/web/src/app/verify-email/page.tsx
apps/web/src/components/account-provider.tsx
apps/web/src/components/account-recovery.tsx
apps/web/src/components/account-settings.tsx
apps/web/src/components/auth-form.tsx
apps/web/src/components/workspace-root.tsx
apps/web/src/lib/account-navigation.ts
apps/web/src/lib/http-workspace-repository.ts
apps/web/src/server/account-email.ts
apps/web/src/server/auth-config.ts
apps/web/src/server/database-operations.ts
apps/web/src/server/handlers.ts
apps/web/src/server/services.ts
compose.yaml
docs/ARCHITECTURE.md
docs/BACKUPS.md
docs/DATABASE_RECOVERY.md
docs/PHASE_4_1_VERIFICATION.md
docs/PHASE_4_VERIFICATION.md
docs/PRODUCT.md
docs/ROADMAP.md
docs/SIDEKICK.md
docs/VERIFICATION.md
docs/decisions/0001-authentication-and-persistence.md
docs/decisions/0002-account-safety-and-recovery.md
package.json
playwright.account.config.ts
playwright.config.ts
pnpm-lock.yaml
tests/account-e2e/accounts.spec.ts
tests/account-e2e/recovery.spec.ts
tests/extension/sidekick.spec.ts
tests/helpers/test-inbox.ts
tests/integration/account-safety.test.ts
tests/integration/database-operations.test.ts
tests/integration/postgres.test.ts
tests/unit/account-navigation.test.ts
```

## Remaining limitations and next slice

- Local Mailpit is a development inbox, not real email delivery. No hosted registration invitation or deployment readiness is claimed. SMTP delivery can be interrupted by process shutdown; request a new message. There is no durable queue.
- Shared rate limits are suitable for this local slice and can affect other local users/tests. Hosted operation needs an explicit trusted-proxy policy, provider delivery configuration, and deployment-specific abuse controls. The timing floor is mitigation, not proof against every enumeration side channel.
- Operational restore is manual, local PostgreSQL 17, and revision-specific. Keep the application stopped; the connection check is not a deployment maintenance gate. Protect/encrypt archives independently and perform provider-specific off-device recovery drills before hosted use.
- Reset links placed in fragments can be altered by some external email security products; only local Mailpit/browser delivery is verified. Recovery messages are English-only. No email-change, MFA, social providers, or account deletion workflow is added.
- Existing manual native Chrome side-panel dock/pinning and hosted browser compatibility limits remain. Automated extension tests use the packaged panel document with the real worker/bridge/capture path.

Recommended next slice: separately authorize hosted account readiness (real email delivery, proxy/abuse configuration, and deployment-specific recovery rehearsal) before external invitations. Resume uploads still need their own storage/security design and authorization. Stop after Phase 4.1.
