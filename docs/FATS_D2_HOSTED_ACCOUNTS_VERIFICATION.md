# FATS D2 — hosted accounts preparation

29 October 2026 · Base `6473d9ab95eb808080ab671e809c9c0cc93d0543` plus uncommitted D2 changes. No commit, push, hosted migration, deployment, DNS change, paid resource, live email or AI call was made.

## Implementation

- Retained Better Auth 1.7.8, `pg` 8.23.1, Kysely and all eleven existing SQL migrations. Added operator-only `pnpm db:migrate:hosted`, with read-only checksum preview, independent direct Neon host/database selection, exact confirmation and sanitized failures. Builds/startup never migrate.
- Runtime auth/erasure/upload guards now use transaction advisory locks on a dedicated transaction-pinned client. The guard spans independently committed library/usage/data work and cleanup; it is released by rollback. Existing erasure exclusion, per-owner upload admission, two global slots and committed failed-attempt accounting remain. No lock was simply removed. Tested through PgBouncer with transaction pooling and `DISCARD ALL` between transactions. [Neon pooling limitations](https://neon.com/docs/connect/connection-pooling).
- Reused bounded process-level pools: max 10, connect 5s, idle 5s, client query timeout 15s, channel binding enabled. Added pinned `@vercel/functions` 3.10.4 solely for `attachDatabasePool()` on Vercel. Remote connections require `sslmode=verify-full`; ambiguous/overriding URL parameters are rejected. Hosted role statement timeouts replace incompatible pooler startup options. [Vercel pool lifecycle](https://vercel.com/kb/guide/connection-pooling-with-functions).
- Reused `AccountMailer` with a small native-fetch Resend adapter: fixed HTTPS endpoint, plain text, 10s timeout, no redirects, no provider bodies/credentials/tokens in errors. Local/test mail remains loopback Mailpit. No Resend SDK, queue or worker added. [Resend send API](https://resend.com/docs/api-reference/emails/send-email).
- Next `after()` keeps delivery within the request lifetime. **Only delivery is deferred.** Better Auth OTP/token persistence remains awaited; its broader background-task option stays unset. Delivery failures log only a fixed message; resend/recovery remain available, without claiming guaranteed delivery. [Next after](https://nextjs.org/docs/app/api-reference/functions/after).
- Retained exact HTTPS origin/trusted-origin checks, host-only Secure/HttpOnly/SameSite=Lax cookies, live database sessions, verified-email gate, narrow endpoint/redirect allowlist, hashed rotating OTPs, transactional reset consumption/session revocation, explicit guest-copy confirmation and owner-scoped queries. On Vercel only, rate limiting trusts `x-vercel-forwarded-for`, which the platform overwrites; arbitrary forwarded IPs remain untrusted. [Vercel request headers](https://vercel.com/docs/headers/request-headers).
- Added isolated hosted-configuration, pooled migration/auth concurrency and no-file-storage browser coverage. Fixed browser test origins to use the configured test port and isolated synthetic tests' shared local login buckets; production limits are unchanged.

## Neon setup — operator work still required

No existing FATS Neon project was returned by connected project discovery. No resource was created. Select PostgreSQL **17**, Singapore near Vercel `sin1`, on an available free allowance; obtain approval before any paid option. Use a fresh, empty test/preview branch/database first and a separate production branch/database. Never clone personal account data for these checks.

Copy the pooled and direct connections for the **same selected branch/database**. Preserve `channel_binding=require` if supplied, change the TLS mode to `sslmode=verify-full`, and do not add identity/SSL overrides. Accepted remote query names are `sslmode`, `channel_binding`, `application_name`, `connect_timeout`, each once. Never disable certificate verification. Keep direct credentials in the private operator environment only.

Set the selected application role's PostgreSQL `statement_timeout` default to `15s` before first account traffic; the application intentionally sends no hosted startup `statement_timeout` through PgBouncer. Runtime guard transactions also use bounded local timeouts. Review free-plan connection/storage/compute allowances; ten clients per function instance is not a global connection limit.

From the repository root, with `DATABASE_URL_UNPOOLED` securely injected for the **disposable test branch**:

```sh
pnpm db:migrate:hosted --host <direct-neon-host> --database <test-database> --check
pnpm db:migrate:hosted --host <direct-neon-host> --database <test-database> --confirm "MIGRATE <direct-neon-host>/<test-database>"
pnpm db:migrate:hosted --host <direct-neon-host> --database <test-database> --check
```

Expect zero applied/eleven pending on an empty target, then eleven applied/zero pending. Repeat application to verify idempotence. The entry point rejects pooled hosts, mismatched independent targets, non-Neon hosts, unsafe TLS, unknown/changed migration checksums and an unrelated existing schema. The existing runner uses a single transaction, checksum ledger and exclusive transaction migration lock. A direct connection avoids pooler restrictions. Local `pnpm db:migrate` retains its local-only policy.

**Production application of these commands needs separate explicit approval**, a verified target and a provider recovery checkpoint. No production connection was used here. The existing local dump/restore helpers remain local-only and are not a hosted recovery procedure.

## Vercel environment checklist

Configure only the intended protected environment. Keep Preview and Production database credentials separate. These names are server-only; never use a `NEXT_PUBLIC_` prefix.

| Name                       | Requirement                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Neon pooled connection for that environment, verified TLS; no migration credential in client code.                                                                                                                                    |
| `BETTER_AUTH_URL`          | Exact canonical HTTPS origin opened by testers. For the existing stable host: `https://fats-edtosoys-projects.vercel.app`. No path, trailing slash or wildcard. A separate Preview needs its own exact stable protected alias/origin. |
| `BETTER_AUTH_SECRET`       | Private, randomly generated, stable secret, at least 32 characters; separate per environment. Rotation invalidates existing sessions.                                                                                                 |
| `FATS_MAIL_PROVIDER`       | `resend` for hosted accounts. Hosted Mailpit fallback is refused.                                                                                                                                                                     |
| `RESEND_API_KEY`           | Private Resend sending credential, scoped to the verified sending domain where available.                                                                                                                                             |
| `FATS_MAIL_FROM`           | Bare mailbox on that verified domain, such as `accounts@<verified-sender-domain>`; no display name or test sender.                                                                                                                    |
| `FATS_AI_MATCHING_ENABLED` | Keep `0`. Leave AI provider/key/test-mode settings unset.                                                                                                                                                                             |
| Existing D1 build names    | Retain `ENABLE_EXPERIMENTAL_COREPACK=1`, `NX_DAEMON=false`, `NX_ISOLATE_PLUGINS=false`, `NEXT_TELEMETRY_DISABLED=1`.                                                                                                                  |
| `VERCEL`, `NODE_ENV`       | Platform-managed; do not manually override. Vercel runtime enables pool lifecycle and trusted proxy handling.                                                                                                                         |
| `DATABASE_URL_UNPOOLED`    | **Operator environment only**, consumed by migration script; not required in Vercel runtime/build.                                                                                                                                    |

Leave `FATS_MAIL_PORT`, `FATS_DOCUMENTS_DIR`, `FATS_CLAMAV_DATABASE_DIR`, sandbox/tool overrides and all provider/evaluation keys unset on Vercel. Ephemeral `/tmp` is not private persistent document storage.

Preserve D0/D1 build settings: root `apps/web`, outside-root sources enabled, install `cd ../.. && pnpm install --frozen-lockfile`, build `cd ../.. && pnpm build`, Next.js preset/default `.next`, Node `24.x`, pnpm `11.27.0`, Fluid, Singapore. Keep **Vercel Authentication → All Deployments** throughout.

## Resend setup and recovery

Create/use a Resend account within its free allowance. Verify a sender domain or subdomain you control; add only Resend's exact verification/SPF/DKIM records in Cloudflare after authorization. This does not require changing the application domain or launching publicly. Keep tracking disabled for auth mail. Create the sending credential and set the three mail variables above. No provider/DNS setup was invented or performed. [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction), [sending prerequisites](https://resend.com/docs/send-with-nodejs).

Verification uses eight-digit, ten-minute, single-use codes; resend rotates the code. Password recovery uses 30-minute, single-use tokens in URL fragments, removed from browser history before same-origin submission; reset revokes existing sessions. Sending-domain verification, actual inbox delivery, provider quota/refusal handling and protected-origin reset-link navigation must be checked with synthetic accounts on an approved hosted test environment. No real inbox or live Resend API was used here.

## Actual verification

Evidence is ignored under `.fats-private/d2/`; all accounts, records and documents were synthetic. Chromium sandbox stayed enabled. Database integration tests refuse non-loopback targets and databases without the `_test` suffix; the optional loopback-only pooler forwards solely to the labelled disposable PostgreSQL instance.

| Check                                                                                | Result                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL integration: `postgres`, `account-safety`, `data-protection`              | **PASS 32/32 direct and 32/32 through transaction PgBouncer**. Migrations/checksums/rollback, real auth/recovery, ownership/transfer, erasure/upload concurrency and failure recovery.                                                                                                                                   |
| New `hosted-accounts` integration through PgBouncer                                  | **PASS 3/3**. OTP persisted before deferred delivery; Secure HTTPS cookie and narrow client-IP policy; queued erasure waits for login guard; read-only migration preview/checksum rejection/concurrent runners.                                                                                                          |
| Hosted configuration/mail unit checks                                                | **PASS 6/6**, including mocked Resend HTTPS transport/refusals, secret-safe errors and remote TLS/target validation. No live email.                                                                                                                                                                                      |
| Full unit suite, serial                                                              | **318 passed / 1 failed (319)**. Unchanged matching-plan source-hash assertion expects an older `resume-extraction.ts` checksum, also recorded in D0. Initial parallel run hit validator process-slot contention; serial run clears those six additional failures. No matching fixture/baseline was changed.             |
| TypeScript/lint/build                                                                | **PASS** `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format:check`; final remote-configuration tests rerun after connection-parameter hardening.                                                                                                                                                                  |
| Hosted-shape browser tests: PostgreSQL/PgBouncer/Mailpit, no persistent file storage | **PASS 36 account-flow cases + 2 no-storage cases**, desktop/mobile. Registration/verification, login/logout/reload, password reset/session revocation, explicit guest copy/retry/cancel, ownership, and storage/scanner denial. The two new cases passed on targeted rerun after awaiting completed sign-in navigation. |
| Guest/PDF browser regressions, production build                                      | **PASS 50/50**, desktop/mobile, themes, persistence, all statuses/filtering, error recovery, local PDF edits/export, no uploads, production V2/design route denial and AI denial.                                                                                                                                        |
| Existing storage-backed fail-closed document/erasure browser regressions             | **PASS 8/8** on the resumed production run through transaction PgBouncer, desktop/mobile. Missing-scanner upload denial, legacy preview/download denial, metadata edits and confirmed erasure of actual legacy/quarantine bytes. Accepted-upload coverage remains unavailable without a configured scanner.              |
| Existing D1 protection                                                               | **PASS**, read-only project inspection reports `enabled=true`, `deploymentType=all`; anonymous requests to stable and exact D1 hosts return 302 to `vercel.com`. No credential or protection change.                                                                                                                     |
| Live Neon, Resend inbox delivery and D2 on Vercel                                    | **NOT RUN**. Credentials, verified sender and an approved hosted test environment are not configured. Local integration is not proof of live provider delivery or hosted behavior.                                                                                                                                       |

Initial browser runs exposed native Node module resolution (`next/server.js`), hard-coded test origins, shared local rate buckets, and storage-backed assertions applied to an absent-storage environment. These were corrected without relaxing production controls or the original assertions; dedicated no-storage cases cover the actual hosted restriction. The final account-flow run passed all 36 existing cases; its two new navigation-race failures were corrected and both reran successfully. The initial parallel unit/CLI sandbox failures are tooling evidence, not successful checks.

The unfinished document run was resolved on resume: its first attempt passed the eight fail-closed cases but timed out in both accepted-upload `data-protection.spec.ts` cases because the real scanner was unavailable and the upload button was correctly disabled. A subsequent attempt could not start because port 3198 was occupied. Neither attempt establishes accepted-upload correctness. The focused rerun used a separate port, unchanged assertions and the existing production build:

```sh
FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3298 NX_DAEMON=false NX_ISOLATE_PLUGINS=false node --env-file=.env.phase4-pooler-test node_modules/@playwright/test/cli.js test --config=playwright.account.config.ts tests/account-e2e/document-availability.spec.ts tests/account-e2e/document-intake.spec.ts --output=.fats-private/d2/document-browser-resumed
```

**PASS 8/8**, exit 0; output is retained in `.fats-private/d2/document-browser-resumed.log`. `node node_modules/vitest/vitest.mjs run tests/unit/hosted-configuration.test.ts` also passed **6/6** on resume. No application code or test assertion changed during this continuation. Original moodboards and D0/D1 reports still match their saved preflight hashes. Only local synthetic services were started; they were returned to their prior stopped state after verification, preserving their records. Accepted-file browser journeys still need separately configured real scanning; no scanner bypass was introduced.

Native migration CLI refusal/redaction checks also passed for missing and pooled connections, before network access. A bounded scan of 39 built client JavaScript assets and 20 local logs found neither the disposable database password nor signing secret. All four moodboard hashes and the pre-existing D0/D1 documents match preflight; generated Next type-reference changes are restored before handoff.

Reproduction helpers: `node apps/web/scripts/test-database.mjs up`, `node apps/web/scripts/mail-test.mjs up`, `node apps/web/scripts/test-pooler.mjs up`. Load ignored `.env.phase4-pooler-test` explicitly to run `vitest --config vitest.integration.config.ts` against the pooler. For the no-storage production browser suite, set `FATS_TEST_PRODUCTION=1`, `FATS_TEST_WITHOUT_STORAGE=1`, an isolated `FATS_TEST_PORT`, then run Playwright with `playwright.hosted-accounts.config.ts`. Never use a production URL in these destructive local test helpers.

## Remaining blockers and next deployment

- **Hosted verification/deployment blocker:** supply an isolated Neon target, verified Resend sender and private credentials; complete the live synthetic mail/auth smoke checks. No production migration or deployment is authorized by D2.
- **Scope limitation:** hosted server document uploads/library/downloads remain unavailable without compatible private persistent storage and scanning. They fail closed; the existing library error/restriction and local PDF tools remain available. Guest/account application workflows require neither. AI stays disabled; dormant matching/operator session-lock paths are not certified for pooled execution and must remain inaccessible.
- **Deferrable:** the existing unrelated matching-plan checksum failure, physical-device/other-browser checks and a separately verified hosted backup/restore drill. Before real personal data, establish provider recovery/retention procedures and monitor mail/DB quotas. This remains a protected synthetic preview, not a public beta.

Next step: provision/select only the free isolated test database and verified sender, privately configure Preview variables for its exact protected origin, then run the hosted migration preview and approved test-target application. Only after the user approves deployment, use the existing authenticated CLI/project settings:

```sh
cd apps/web
vercel link --project fats --scope edtosoys-projects
vercel deploy --scope edtosoys-projects
```

This requests a Preview (no `--prod`). Verify the returned environment before routing testers; D1's first deployment was assigned Production by Vercel despite a Preview request. Before and after authenticated synthetic smoke tests, verify anonymous denial on every returned URL and protection `all`. Test register → email → verify → login → save/reload → logout/login → reset/revocation, explicit guest transfer and two-account ownership. Keep the canonical origin consistent; guest browser storage is origin-specific.

Do not promote or run production migrations until separately approved. To withdraw an eventual D2 release, restore D1 deployment `dpl_4qByXMSZj1L2DLNTus4BsmG59oh6` while retaining All Deployments protection; leave the account database intact and do not attempt destructive down-migrations. The original D1 deployment retains its guest-only environment snapshot; guest data stays in the browser. The current D1 deployment was not modified.
