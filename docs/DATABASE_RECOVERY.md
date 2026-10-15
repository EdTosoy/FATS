# Database backups and recovery

Phase 4.1 provides a verified **local PostgreSQL 17** archive/restore workflow. It creates no cloud resources and does not automate a hosted disaster-recovery service. Stop the application before restoration. Keep an independent copy of the current database before replacing it, and prefer restoring into a fresh, dedicated database first.

## JSON exports and operational archives

| Tool                       | Contents                                                                                                  | Scope and recovery                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings → Data management | One active workspace's applications/interviews/notes                                                      | Compatible version 1 JSON; preview and confirmed replacement; no passwords/sessions. Works for guest and account workspaces.                                                          |
| `db:backup` / `db:restore` | Public-schema FATS database, accounts, password hashes, record ownership, relationships, migration ledger | Operator-only PostgreSQL archive plus manifest; explicit target and confirmation. Restore revokes all sessions, verification/reset tokens, and staged replacement/migration previews. |

Both formats contain private, unencrypted information. Database archives additionally contain authentication material. Keep them outside shared folders/source control, restrict access, and use an approved encrypted/off-device storage process for important backups. No such external storage is provisioned in this slice. Losing the database volume and its only local dump together is not recoverable.

## Create a local archive

From the root with Node 24, pnpm 11, and Docker:

```sh
pnpm db:up
pnpm db:migrate
pnpm db:backup --container ats-postgres-1 --database fats --file backups/fats-2026-10-15.dump
```

Choose a new filename for each backup. The tool uses the private `DATABASE_URL` from `apps/web/.env.local`, verifies the explicit database/container/loopback port, and refuses unrelated tables or missing/changed migrations. It takes a consistent snapshot while `pg_dump` runs. A successful result produces two files:

- `fats-2026-10-15.dump`: PostgreSQL custom archive, mode 0600.
- `fats-2026-10-15.dump.manifest.json`: format version, PostgreSQL major version, archive checksum, migration checksums, and counts, also mode 0600.

Keep the pair together. Interrupted or failed operations do not claim a valid backup. An absent/mismatched sidecar fails validation; keep the original files for investigation and create a new backup under a new name. Existing outputs are never overwritten. Dumps, manifests, interrupted `.dump.*.partial` files, and `backups/` are ignored by Git. Environment files and database passwords are not included.

The wrapper uses the installed container's `pg_dump`/`pg_restore`/`psql`, so no host PostgreSQL tools are required. It supports only the `ats` Compose PostgreSQL service or the labelled FATS disposable test container. Remote targets and system databases are refused. The archive requires the same PostgreSQL major and exact FATS migration set/checksums; restore with the matching code revision before separately testing any upgrade.

## Preview and explicitly restore

Create/select a dedicated destination database. For example, to inspect a local development backup in a fresh database:

```sh
docker exec ats-postgres-1 createdb -U fats fats_restore_test
```

Create a private, Git-ignored `.env.restore` file (mode 0600) containing **only the independently selected target connection**. Use the real local password privately; this example value is a placeholder:

```dotenv
FATS_RESTORE_DATABASE_URL=postgresql://fats:EXAMPLE_PASSWORD@127.0.0.1:5433/fats_restore_test
```

The restore command never falls back to `DATABASE_URL`. Do not put passwords into command arguments, shell history, tickets, or shared logs. Preview the actual container/database and archive counts first:

```sh
node --env-file=.env.restore apps/web/scripts/database.mjs restore --container ats-postgres-1 --database fats_restore_test --file backups/fats-2026-10-15.dump --check
```

After reviewing that result, stop the web application and close database clients for the destination. Confirm the exact destination by typing it in the command:

```sh
node --env-file=.env.restore apps/web/scripts/database.mjs restore --container ats-postgres-1 --database fats_restore_test --file backups/fats-2026-10-15.dump --confirm 'RESTORE fats_restore_test'
```

`pnpm db:restore` exposes the same wrapper when the explicit target variable is already loaded privately. A missing/mismatched confirmation does not change data. Never use a user's current workspace as a restore test. The tool checks target identity, PostgreSQL version, archive integrity/compatibility, unrelated tables, and other open connections. Checksums do not establish who created a dump: restore only trusted archives, since PostgreSQL restores executable SQL.

Schema/data replacement, count/ledger verification, and token revocation commit together. Any SQL error rolls the transaction back, retaining the previous destination. Temporary SQL is private and removed after the operation. Logs suppress SQL/rows/credentials, retaining only a SQLSTATE when available. No success is printed unless the complete restore succeeds.

## Verify and recover

1. Keep the application stopped after any failure. Retain the original archive/manifest and the original database. Read the safe error: wrong target/confirmation, damaged pair, incompatible revision, other connections, or database utility failure.
2. For an invalid/incomplete pair, select another complete trusted pair. Do not edit checksums to make a damaged archive pass. A failed validation never starts replacement.
3. For a version/checksum mismatch, use the source code/PostgreSQL version that created the archive, restore into a fresh database, and test upgrades separately.
4. After a successful restore, point a private local application configuration at the recovered database. Keep the original database until you have signed in, checked applications/interviews/notes/relationships, and exported a user JSON backup. All previous sessions and recovery links are intentionally invalid; sign in again or request a new recovery message.
5. Start the local server only after verification. Resume normal backups under new filenames. Remove a disposable recovery database only after explicitly deciding its data is no longer needed.

Live mutation during restoration is not supported. The tool checks open connections, but the operator must keep the application stopped throughout; this is not a deployment maintenance/connection-gating system. The archive does not include PostgreSQL roles/configuration, the Better Auth environment secret, browser-local records, unsaved drafts, or Mailpit messages. Password hashes remain valid; all session/recovery tokens are revoked during restore.

## Repeat the executed disposable drill

```sh
pnpm db:test:up
pnpm test:integration tests/integration/database-operations.test.ts
```

The test creates uniquely named source/destination databases inside the labelled disposable PostgreSQL container. It registers/verifies an account, saves an application/interview, creates sessions/recovery/staged state, makes an actual archive, tests invalid/missing/wrong-target confirmations, performs the real restore, and checks full record equality, login, foreign keys, schema checksums, and token/session revocation. It also checks refusal of in-use targets and preservation after invalid files. It removes only its own disposable databases. Exact results are in [Phase 4.1 verification](PHASE_4_1_VERIFICATION.md).
