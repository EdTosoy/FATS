# ADR 0002 — Local account verification, recovery, and database archives

Status: accepted for the explicitly requested Phase 4.1 local slice (2026-10-15).

## Authentication

Retain the Next Node API, Better Auth 1.7.8, PostgreSQL, and repository boundary from [ADR 0001](0001-authentication-and-persistence.md). Require email verification before account login/workspace access. Existing unverified accounts are not silently marked verified: their records remain in place, and existing sessions receive a verification gate. Guest recovery and JSON backups remain available after sign-out. Public authentication/recovery screens are independent of the workspace provider so an expired/unverified account cannot block them.

Use Better Auth's supported email OTP plugin for verification. The installed default email-link implementation uses a stateless signed token and treats already verified accounts as success. The OTP plugin supplies database-backed atomic consumption and attempt accounting, matching this slice's explicit single-use/replay requirements without application cryptography. Configure eight digits, 10-minute expiry, five attempts, hashed OTP values and verification identifiers, rotation on resend, and no OTP login or account creation. Only the two required verification endpoints are exposed through the existing narrow wrapper; alternate plugin endpoints remain inaccessible.

Use Better Auth's existing password-reset flow: 30-minute tokens, hashed database identifiers, and `revokeSessionsOnPasswordReset`. The installed library consumes the token, revokes that account's sessions, and changes the credential in one transaction. Email reset links go directly to the reset page with the token in the fragment; the browser removes it from history and sends it only in a same-origin JSON POST. Do not expose the library's token-in-path/query callback routes. No automatic sign-in after verification/reset; users sign in with their password.

Project registration/email-request responses to an identical generic success shape. Normalize login failures for wrong credentials and unverified accounts, and verification failures for unknown/expired/exhausted codes. Bound bodies, keep exact origin/Host checks and HTTP-only SameSite cookies, and retain Secure cookies on HTTPS. Use library database rate limits: resend/reset requests three per minute, verification attempts 30/minute plus five per code, reset submissions 10/minute. This local server does not trust arbitrary forwarded IPs, so path limits are shared. A 500 ms floor on public email requests reduces timing differences; only SMTP delivery runs asynchronously, while OTP/token persistence stays inside the library's awaited flow. No constant-time/network-anonymity guarantee is claimed.

## Local mail and configuration

Nodemailer supplies SMTP transport; this dependency avoids implementing SMTP. Mailpit v1.31.6 is the only delivery destination in this slice, bound to loopback with no relay/provider credentials. A separate inbox/SMTP port serves isolated synthetic-account tests. SMTP protocol/content logging is disabled; failures log only a fixed safe message. A stopped Node process can interrupt delivery, so the UI offers resend rather than claiming delivery is guaranteed. There is no durable mail queue.

The runtime service factory refuses non-loopback application origins while delivery is local-only, preventing accidental hosted registration into a local inbox. HTTPS cookie behavior is still covered by injected test services. Hosted SMTP, DNS/sender reputation, trusted-proxy/IP policy, and deployment-specific abuse controls need a separately authorized slice. No cloud resources, paid account, or production email secret is needed here.

## Operational PostgreSQL archives

Keep user JSON exports unchanged. Add local PostgreSQL 17 custom archives using the matching container utilities. Hold an exported repeatable-read snapshot while dumping; record migration checksums and collection counts from that same snapshot. Store a SHA-256 sidecar manifest and private archive with exclusive filenames. Checksums detect damage, not a malicious author; restore only trusted archives.

Restoration requires an independently configured target URL, explicit container/database selection, a compatible archive/manifest, and the exact `RESTORE <database>` confirmation. Refuse remote/system/non-FATS targets, mismatched loopback ports/identities, unrelated tables, and in-use targets. `--check` performs no writes. Restore schema/data and post-restore ledger/count checks in one `psql --single-transaction --set=ON_ERROR_STOP=1` operation. Fully qualify post-restore names because pg_dump clears `search_path`. Revoke sessions, verification/reset tokens, and pending replacement stages in the same transaction, preventing an old backup from reactivating logged-out sessions or stale transfer confirmations.

Only public-schema FATS database data is archived. Environment secrets, roles, access policy, and mailboxes are separate operational assets. Wrapper support is deliberately limited to the checked-in local Compose database and labelled disposable test database. Future hosted recovery must adapt and verify provider-specific tooling/configuration; a local restore drill is not proof of hosted disaster recovery.

## References and proof

Checked installed library implementation/types for OTP atomic consumption, hashed storage, registration enumeration behavior, and transactional credential reset; checked installed Next 16.4 route/page documentation. Official references: [Better Auth email OTP](https://better-auth.com/docs/plugins/email-otp), [email/password recovery](https://better-auth.com/docs/authentication/email-password), [security](https://better-auth.com/docs/reference/security), [Nodemailer SMTP](https://nodemailer.com/smtp), [Mailpit Docker](https://mailpit.axllent.org/docs/install/docker/), [pg_dump 17](https://www.postgresql.org/docs/17/app-pgdump.html), and [pg_restore 17](https://www.postgresql.org/docs/17/app-pgrestore.html).

Actual PostgreSQL restore, token/transaction failures, browser/mail delivery, and regression evidence are recorded in [Phase 4.1 verification](../PHASE_4_1_VERIFICATION.md). Commands and recovery steps are in [database recovery](../DATABASE_RECOVERY.md).
