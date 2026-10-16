# Database backups and recovery

Offer Desk adds `offers` and `offer_events` to the recognized schema. Full archives preserve offer revisions, negotiation/decision history, checklist/questions, request fingerprints, and exact private letter links. After restoration, open application Offer Desk, compare original/revised terms and decisions, and download the linked version. Settings version 2 JSON restores offer history additively, with original letter references kept explicitly unlinked. Migration 0007 adds this provenance column; full operator archives preserve it alongside actual live document links and bytes. Legacy JSON replacement still protects existing offers. See [Offer Desk recovery choices](OFFER_DESK.md) and [executed verification](OFFER_DESK_VERIFICATION.md).

Phases 5–6 extend the verified **local PostgreSQL 17** archive/restore workflow to private files and comparison reports. It creates no cloud resources and does not automate a hosted disaster-recovery service. Stop the application before restoration. Keep an independent copy of the current database before replacing it, and prefer restoring into a fresh, dedicated database first.

## Hardening 2 acceptance after recovery

Migration 0009 adds security/scan evidence to the existing `document_objects` ledger. Restore clears acceptance to `legacy` without modifying immutable document versions or bytes. Before reopening a restored workspace, reconcile the independent deletion register, run `pnpm data:cleanup`, configure/verify the real scanner with `pnpm documents:scanner`, run `pnpm documents:recheck`, then `pnpm documents:check` against the matching restored database and fresh file directory. Unverified/unsafe/missing files remain blocked for download, preview, new links and extraction; original metadata/history is retained. The file bundle includes referenced versions, not uncommitted quarantine bytes. Missing non-live quarantine bytes can be cleaned idempotently through the durable intent ledger.

Actual ClamAV operation is not verified on this host and remains a blocker. Recovery tests use explicitly labelled synthetic scanner receipts to verify relational/file recovery, not malware protection. See [Hardening 2 verification and runtime setup](PRIVATE_BETA_HARDENING_2_VERIFICATION.md). Retain earlier exact-revision archive/checksum rules and operator backup expiry/deletion-register obligations.

## Hardening 1 recovery state

Migration 0008 adds recognized `document_objects`, `account_erasures`, and `document_upload_usage` tables. Full SQL archives retain pending erasure/file intent state; paired file bundles still include only live referenced versions. After a restore, keep the application stopped and run `pnpm data:cleanup` against the **restored database and matching fresh restored private directory**, then `pnpm documents:check`, before reopening access. Missing non-live bytes are safe for idempotent cleanup. A pending account stays blocked even when its prior session/recovery state was already revoked.

Restoring an older archive can resurrect previously deleted accounts/data. Current live erasure cannot rewrite old archives, WAL/snapshots, inboxes or client downloads. Retain an independent restricted deletion register and reconcile it before reopening any recovered database; establish archive expiry and disposal policy. These operational requirements remain real-data beta blockers. See [Hardening 1 guarantees and test evidence](PRIVATE_BETA_HARDENING_1_VERIFICATION.md). Earlier revision archives must still use their matching migration/code set; do not bypass checksums.

## JSON exports and operational archives

Phase 5 archives use manifest version 2. Complete document recovery requires the dump, manifest, and matching `.dump.documents/` directory. A dump alone contains document metadata but cannot recover file content. Version 1 operational archives remain revision-specific: recover them with the Phase 4.1 code, then test migration separately; do not edit manifests to bypass compatibility checks.

| Tool                       | Contents                                                                                                  | Scope and recovery                                                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings → Data management | One active workspace's applications/interviews/notes                                                      | Compatible version 1 JSON; no document metadata/files/submitted links, passwords, or sessions. Replacement is blocked while submitted links exist. Works for guest and account workspaces.                             |
| `db:backup` / `db:restore` | Public-schema FATS database, accounts, password hashes, record ownership, relationships, migration ledger | Operator-only PostgreSQL archive, manifest, and matching private file directory; explicit target and confirmation. Restore revokes all sessions, verification/reset tokens, and staged replacement/migration previews. |

Both formats contain private, unencrypted information. Database archives additionally contain authentication material. Keep them outside shared folders/source control, restrict access, and use an approved encrypted/off-device storage process for important backups. No such external storage is provisioned in this slice. Losing the database volume and its only local dump together is not recoverable.

Phase 6 adds reviewed resume/job text, structured comparison results, analysis configuration, exact resume/job revisions, and persistent usage counters to operator archives. JSON v1 exports exclude all of these and comparison reports block JSON replacement until explicitly deleted, alongside submitted-link restrictions. Treat operator archives as containing sensitive resume text even after a report is deleted from the live account. Existing consistent PostgreSQL snapshots cover matching tables; the file bundle covers their immutable resume versions. Restore preserves completed reports and counters, deletes all extraction previews, and marks in-flight comparisons failed/interrupted while clearing their sources. It never reruns external analysis. Report expiry does not remove earlier archives or provider copies. See [matching retention/privacy](MATCHING.md).

## Create a local archive

From the root with Node 24, pnpm 11, and Docker:

```sh
pnpm db:up
pnpm db:migrate
pnpm db:backup --container ats-postgres-1 --database fats --file backups/fats-2026-10-15.dump
```

Choose a new filename for each backup. The tool uses the private `DATABASE_URL` from `apps/web/.env.local`, verifies the explicit database/container/loopback port, and refuses unrelated tables or missing/changed migrations. If documents exist, `FATS_DOCUMENTS_DIR` must select their private byte store. It takes a consistent snapshot while `pg_dump` runs. A global advisory lock blocks document mutations until file copying finishes; unrelated application edits remain snapshot-consistent. Every referenced document file is copied and checked against its stored size/SHA-256. Missing/corrupt/unreadable bytes fail the operation. A successful result produces:

- `fats-2026-10-15.dump`: PostgreSQL custom archive, mode 0600.
- `fats-2026-10-15.dump.manifest.json`: format version 2, PostgreSQL major version, archive checksum, migration checksums, counts, and document key/size/hash inventory, also mode 0600.
- `fats-2026-10-15.dump.documents/`: required when the inventory is nonempty; mode 0700, containing verified immutable files as mode 0600.

Keep all parts together. Interrupted or failed operations do not claim a valid backup. Partial directories/files may remain privately for investigation and are never accepted without a complete valid archive and manifest. An absent/mismatched sidecar fails validation; keep the original files for investigation and create a new backup under a new name. Existing outputs are never overwritten. Dumps, manifests, paired document directories, interrupted `.dump.*.partial` files, and `backups/` are ignored by Git. Environment files and database passwords are not included.

The wrapper uses the installed container's `pg_dump`/`pg_restore`/`psql`, so no host PostgreSQL tools are required. It supports only the `ats` Compose PostgreSQL service or the labelled FATS disposable test container. Remote targets and system databases are refused. The archive requires the same PostgreSQL major and exact FATS migration set/checksums; restore with the matching code revision before separately testing any upgrade.

## Preview and explicitly restore

Create/select a dedicated destination database. For example, to inspect a local development backup in a fresh database:

```sh
docker exec ats-postgres-1 createdb -U fats fats_restore_test
```

Create a private, Git-ignored `.env.restore` file (mode 0600) containing **only the independently selected target connection**. Use the real local password privately; this example value is a placeholder:

```dotenv
FATS_RESTORE_DATABASE_URL=postgresql://fats:EXAMPLE_PASSWORD@127.0.0.1:5433/fats_restore_test
FATS_RESTORE_DOCUMENTS_DIR=/absolute/private/path/fats-recovery-2026-10-15
```

The restore command never falls back to `DATABASE_URL` or `FATS_DOCUMENTS_DIR`. For archives with documents, the independently selected document target must not exist yet; an existing directory is never replaced. The parent must already exist and be private/canonical. `--check` validates this selection and all source file content without creating the target. Do not put passwords into command arguments, shell history, tickets, or shared logs. Preview the actual container/database and archive counts first:

```sh
node --env-file=.env.restore apps/web/scripts/database.mjs restore --container ats-postgres-1 --database fats_restore_test --file backups/fats-2026-10-15.dump --check
```

After reviewing that result, stop the web application and close database clients for the destination. Confirm the exact destination by typing it in the command:

```sh
node --env-file=.env.restore apps/web/scripts/database.mjs restore --container ats-postgres-1 --database fats_restore_test --file backups/fats-2026-10-15.dump --confirm 'RESTORE fats_restore_test'
```

`pnpm db:restore` exposes the same wrapper when the explicit target variable is already loaded privately. A missing/mismatched confirmation does not change data. Never use a user's current workspace as a restore test. The tool checks target identity, PostgreSQL version, archive integrity/compatibility, unrelated tables, and other open connections. Checksums do not establish who created a dump: restore only trusted archives, since PostgreSQL restores executable SQL.

File bytes are copied to the fresh private target and verified before schema/data replacement starts. Schema/data replacement, count/ledger/document-inventory verification, and token revocation commit together. Any SQL error rolls the transaction back, retaining the previous database destination. Copied bytes are retained after an attempted SQL restore, even if the result is an error: a lost commit response could be ambiguous. Keep the application stopped, inspect the destination, and select a fresh file target for a deliberate retry. Failed copying before any SQL restore can discard only the newly created partial target. Temporary SQL is private and removed after the operation. Logs suppress SQL/rows/credentials, retaining only a SQLSTATE when available. No success is printed unless the complete restore succeeds.

## Verify and recover

1. Keep the application stopped after any failure. Retain the original archive/manifest and the original database. Read the safe error: wrong target/confirmation, damaged pair, incompatible revision, other connections, or database utility failure.
2. For an invalid/incomplete pair, select another complete trusted pair. Do not edit checksums to make a damaged archive pass. A failed validation never starts replacement.
3. For a version/checksum mismatch, use the source code/PostgreSQL version that created the archive, restore into a fresh database, and test upgrades separately.
4. After a successful restore, point a private local application configuration at both the recovered database and recovered document directory. Keep the original database until you have signed in, checked applications/interviews/notes/relationships and completed comparison reports/source references, verified every document version and submitted link, run `pnpm documents:check`, and exported a user JSON backup (which excludes documents and reports). Confirm interrupted attempts are labelled failed and not rerun. All previous sessions and recovery links are intentionally invalid; sign in again or request a new recovery message.
5. Start the local server only after verification. Resume normal backups under new filenames. Remove a disposable recovery database only after explicitly deciding its data is no longer needed.

Live mutation during restoration is not supported. The tool checks open connections, but the operator must keep the application stopped throughout; this is not a deployment maintenance/connection-gating system. Only matching manifest-listed document bytes are included; partials, unreferenced objects, and garbage-queue bytes are not needed to recover live documents. The archive does not include PostgreSQL roles/configuration, the Better Auth environment secret, browser-local records, unsaved drafts, or Mailpit messages. Password hashes remain valid; all session/recovery tokens are revoked during restore.

## Repeat the executed disposable drill

```sh
pnpm db:test:up
pnpm test:integration tests/integration/database-operations.test.ts
```

The test creates uniquely named source/destination databases inside the labelled disposable PostgreSQL container. It registers/verifies an account, saves an application/interview, creates sessions/recovery/staged state, makes an actual archive, tests invalid/missing/wrong-target confirmations, performs the real restore, and checks full record equality, login, foreign keys, schema checksums, and token/session revocation. It also checks refusal of in-use targets and preservation after invalid files. It removes only its own disposable databases. The Phase 5 drill additionally saves multiple versions, links an older version, rejects damaged/missing content and metadata-only archives, tests fresh file targets and SQL rollback with retained private bytes, and restores exact metadata/bytes/links. Phase 6 also restores completed comparison/source equality, preserves usage, discards previews, and fails in-flight attempts without a provider call. Current results are in [Phase 6 verification](PHASE_6_VERIFICATION.md); [Phase 5 evidence](PHASE_5_VERIFICATION.md) retains the earlier drill results.
