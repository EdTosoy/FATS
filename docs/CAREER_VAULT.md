# Career Vault MVP

Career Vault is a personal organizer for verified FATS accounts at `/career-vault`. It helps graduates record their first job, retain previous employment and track useful documents for their next transition. It is not an employer, official record issuer, employment verification, payroll or tax service. Empty accounts have no jobs or document entries. Guests see sign-in guidance and retain local PDF Tools access.

## User journeys

Choose **Career Vault → Add employment**. Record employer, title, employment type and **Not started**, **Current**, or **Previous**. Current requires a start date; Previous requires start/end dates in order. Not started allows a proposed date and never claims work has begun. Location, work arrangement and notes are optional. Dates/statuses are personal records, not independently verified facts.

An explicit accepted-offer prefill copies available employer/role/type/location/arrangement/proposed start details while retaining Not started. Users confirm actual dates/status themselves. An optional application connection reuses an existing owned application. Neither action duplicates or updates applications, offer decisions, recruitment stages or interviews. New accepted-offer associations are server-checked; later offer changes do not rewrite employment history.

Within a job, add only document entries that matter to you. Categories are Employment contract, Certificate of Employment (COE), BIR Form 2316, Resignation letter, Clearance documentation, Final-pay documentation, Payslip and Other employment records. FATS does not assume every category applies and never generates employer-issued documents.

Each entry has **Not requested**, **Requested**, **Received**, or **Not applicable**, with optional label, request/issue/follow-up dates and notes. BIR Form 2316 and Payslip additionally support a tax year. Follow-up dates are personal references, without notifications or employer contact. Received can mean a paper copy or a record kept elsewhere: it never proves a file is stored or downloadable in FATS.

Edit records without losing prior snapshots; expand employment/document history to inspect earlier values. Search/filter employment and archive/unarchive to reduce clutter. Archive retains all entries, history and exact file relationships. There is no ordinary employment/history deletion in this MVP. Complete account erasure removes it through the existing lifecycle. Failed saves retain drafts; stale forms require reviewing the latest saved record rather than silently overwriting it.

## Files and PDF Tools

Metadata works without operational scanning or configuring a byte store. **Saving new files remains unavailable while required live scanning is paused/unverified.** There is no Career Vault upload endpoint, alternative storage or scanner bypass.

Optional choices list available active library versions. A new link requires a live verified owner, owner-scoped version/document rows, exact-hash accepted evidence and a fresh integrity-checked private byte read. Archived versions may only be retained when previously linked to that same register entry; otherwise restore the library document first. Foreign, quarantined, legacy, missing and damaged versions cannot become usable links. Choose No file to continue with metadata; earlier history remains protected.

Downloads appear only for versions currently reported available by the library, and the existing endpoint repeats live ownership/accepted/integrity checks. A later blocked state cannot be overridden by history. References to earlier versions restrict ordinary file deletion; archive preserves them. Linking never copies bytes. Imported references have no download action.

**Open local PDF Tools** reuses the existing explicit local-file chooser and local export. PDF bytes/signature marks are not sent to Career Vault or silently saved. No new PDF engine, certified signing or signature-reuse store is introduced. See [PDF Tools](PDF_TOOLS.md) and [Documents](DOCUMENTS.md).

## Model and integrity

Migration **0010_career_vault.sql** adds two tables without changing migrations 0001–0009:

- `career_employments`: owner/UUID, aggregate version, current details, optional application/offer relationships and timestamps.
- `career_events`: immutable ordered employment/document snapshots, per-owner unique request UUID/fingerprint, register-entry UUID, recorded timestamp, optional exact private version FK and optional unlinked source-version provenance. Current register entries derive from each entry's last snapshot, avoiding a second mutable register copy.

Composite foreign keys enforce same-user application/offer/file relationships. Historical references protect parents. A partial unique index prevents two current associations to the same application. Duplicate employer/role/start combinations are refused with guidance to open the existing record. Archive does not bypass limits.

`libs/domain/src/career.ts` provides UI-independent validation/derivation; `career-backup.ts` validates portable history and plans conflict-safe imports. The server-only repository follows existing active-owner/user/workspace/maintenance locks, transactional saves, optimistic versions and idempotent request fingerprints. Every save increments the workspace revision, invalidating an earlier import preview. `/api/career-vault` uses live uncached verified sessions, exact same-origin checks, private/no-store responses, a 32 KiB body limit, strict fields and fixed errors. Payloads never establish ownership.

Limits: 50 employments/account; 100 history entries/employment; 30 document entries/employment; names/labels/locations 200 characters; notes 2,000 characters; validated calendar dates in the existing 1900–2200 subset. Each save counts toward history; reaching a limit never prunes history. Export and request assistance. Combined JSON backups retain the 10 MiB limit. No dependencies/system software were added.

Unchanged retries retain their request ID; edited drafts use a new request. After a stale-version error, cancel, reload saved records and reopen to review current values. Account change/expiry uses the existing gate and never falls back into guest persistence. Account metadata is not written to localStorage. Unsaved forms remain volatile.

## Portability, erasure and recovery

Settings exports `fats-backup` **version 3** when vault records exist: applications/interviews/offers plus `employments`, current details and complete ordered employment/register snapshots. IDs, timestamps, request IDs, states, dates and notes survive. Workspaces without vault records keep their earlier export format. Versions 1/2 retain their semantics; guests reject version 2/3 rather than drop account-only data.

Version 3 shares the existing preview, owner-bound 15-minute token, explicit confirmation, revision check and single transaction. It adds missing records, skips identical records and blocks the whole import on conflicts, request collisions, duplicate jobs, invalid history or missing parents. It never merges or overwrites a more recent record. Repeated confirmation is idempotent. Version 1 replacement is blocked when any vault history exists; version 2 additions preserve it.

All exported document snapshots have `documentVersionId: ""`; `documentReference` may retain the old UUID as unlinked provenance. It grants neither file recovery nor access, even when the destination owns an accepted version with that exact UUID. Identical existing employments are skipped, preserving their existing links. JSON contains no private bytes, complete library metadata, storage keys, owner/session information, scanner receipts or PDF drafts. It is a private **unencrypted** download; protect it.

Erasure removes career events and headers before their protected application/offer/document parents, preserving the existing access-block and recoverable file cleanup ordering. Operator archives recognize both new tables and retain full history/FKs. Linked bytes remain in the existing matching database/manifest/file bundle. Exact migration compatibility, independent restore target, idle application, exact destructive confirmation, session/token revocation, acceptance invalidation and reconciliation remain required. Earlier archives need their matching revision; never edit checksums/manifests. See [JSON backups](BACKUPS.md), [operator recovery](DATABASE_RECOVERY.md), and [verification](CAREER_VAULT_VERIFICATION.md).

## Remaining scope

ClamAV installation/live verification remains paused. Real-data beta blockers still include intended-runtime isolation/headroom, cleanup/scanner freshness supervision, retention/deletion registers and archive/WAL expiry, protected off-device recovery, hosted email/HTTPS/restricted access, monitoring/support/privacy ownership, accessibility and real-device evidence. This milestone removes none of those operational blockers.

Recommended next work is a synthetic graduate walkthrough and retention/recovery rehearsal. Direct accepted-file handoff to PDF Tools and new-file intake require separately authorized scanner verification/integration. AI, payroll/tax calculation, official records, employer/government integrations, freelancer contracts, notifications, paid services and deployment remain excluded.
