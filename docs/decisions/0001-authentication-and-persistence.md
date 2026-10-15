# ADR 0001 — Account persistence in the existing Next application

Status: accepted for the explicitly requested Phase 4 local development slice (2026-10-15).

Phase 4.1 extends this decision with required email verification, password recovery, and operational archives; see [ADR 0002](0002-account-safety-and-recovery.md). Statements below about absent mail/recovery describe the original Phase 4 baseline.

## Decision and alternatives

Use Next.js Node Route Handlers, Better Auth email/password authentication with database-backed sessions, and PostgreSQL through the `pg` driver. NestJS would add another runtime, API deployment, cookie/CORS boundary, and configuration surface without a separate consumer or background workload. The existing repository abstraction already separates the UI from storage. Keep that boundary and add a client HTTP adapter and a server PostgreSQL implementation. Do not introduce microservices, an ORM, a backend framework, or cloud resources.

Better Auth supplies password hashing, cookie signing, session creation/expiration/revocation, and auth request defenses. Do not implement authentication cryptography. Configure exact trusted origins, HTTP-only SameSite cookies, Secure cookies for HTTPS (required for non-loopback origins), database session checks without cookie caching, and auth rate limiting. No social providers, mail delivery, password recovery email, or resume upload in this phase. Email ownership is not verified; this is a local foundation, not authorization to deploy public registration.

Use checked-in SQL migrations with a checksum ledger and a transaction/advisory lock. Generate the initial auth schema from the installed library's configuration; retain subsequent versioned migrations rather than automatic runtime schema changes. PostgreSQL is local, with a persistent development volume and a separate disposable test database. Never migrate an unknown production database as part of verification.

## Ownership and transactions

The API derives ownership only from a validated server session. Every record query includes that owner. Applications and interviews use `(owner, id)` keys, allowing legacy string identifiers to be preserved independently for each account. A composite foreign key prevents an interview from linking to another user's application. Parent deletion remains restricted while interviews exist. Domain validation remains UI/storage independent and runs again at the server boundary. Client-supplied owner IDs are rejected/ignored, never authoritative.

Serialize writes using an owner workspace row lock. Snapshot reads use a consistent database transaction. Sidekick save checks the capture ID and canonical source URL inside the same write transaction, preventing concurrent duplicate handoffs. Database/server timestamps govern new writes; local migration and backup restores preserve original IDs, timestamps, statuses, notes, and UTC/timezone pairs.

Account backup previews are owner-bound database stages with expiration and a base workspace revision. Confirmed replacement checks that revision and writes both collections transactionally. Failure rolls back everything; retries of an applied stage do not apply it again. The `fats-backup` version 1 format stays compatible. Backups contain saved records only, never account/password/session data.

## Local compatibility and migration

Keep the existing local repository for guests and recovery. It is a separate, visibly local workspace, not a cache of account data. Signed-in views use only the HTTP repository. Logout/account changes clear account view state; session expiry blocks account writes and offers sign-in, never silently switches a pending write to local storage. No account records or credentials are copied to browser local storage.

Migration is an explicit additive transfer of a validated local snapshot. Preview counts distinguish new and identical records. Matching IDs with different contents reject the complete transfer rather than overwriting either version; users can export backups to resolve conflicts deliberately. Confirming rechecks the account revision and transfers related records in one transaction. A durable owner-bound snapshot fingerprint records completion; retries/interrupted responses do not copy again. The original local key is never deleted or rewritten by migration. Changes after preview require a new preview. Full account replacement remains the separate, confirmed backup-restore flow.

Existing Phase 1 envelopes without interviews still load. Backups remain version 1. IDs of up to 256 characters are retained; longer legacy IDs reject the whole transfer with recovery guidance. Migration 0003 removes redundant raw text length limits that would reject valid version 1 whitespace; shared domain validation still enforces trimmed lengths at the server boundary. No automatic account assignment or upload occurs on registration/login. Two local hostnames remain separate browser workspaces.

## Sidekick and security boundary

Preserve the extension's exact origin/path/sender checks and opaque URL fragment. Authentication happens only inside FATS; no cookies, passwords, or session tokens go to the extension or job page. Logged-out users can sign in and return to the same handoff ID, or deliberately use local storage. The existing 15-minute handoff validity still applies. Account APIs require a live session, same-origin JSON writes, bounded request bodies, and non-cacheable responses. SQL values are parameterized. Untrusted descriptions remain inert text.

## Sources checked

- Installed Next 16.4 documentation: `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.
- [Better Auth Next integration](https://better-auth.com/docs/integrations/next), [PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql), [email/password](https://better-auth.com/docs/authentication/email-password), [session management](https://better-auth.com/docs/concepts/session-management), and [security](https://better-auth.com/docs/reference/security). Check the installed version's types/source before relying on configuration behavior.

## Consequences and verification

One web process and one local database are sufficient. SQL migrations and auth upgrades require review. Database volume persistence is not a database backup strategy. Local guest data, pending drafts, and account data have different recovery paths, which the UI/docs must state. Verify ownership, foreign keys, rollback, retries, auth cookies/revocation, account backup restore, migration, and Sidekick using actual PostgreSQL and browser requests. Public hosting, email verification/recovery, abuse controls appropriate to a deployment, and operational backups remain separately scoped prerequisites.
