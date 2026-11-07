# FATS repository guidance

Use the global working agreements. This file adds repository-specific context; it does not authorize commits, pushes, publishing, deployments, or destructive actions.

## Scope and product invariants

- FATS is a personal job-search companion, primarily for fresh graduates in the Philippines. Employers do not post jobs here. Saving a job does not apply for it.
- Phases 0–6 are the historical baseline, not a current stop rule. Later implemented work includes Offer Desk, private-data hardening, browser-only PDF Tools, Career Vault, Momentum and R1–R5. Preserve these implementations; their presence does not authorize further product work, live AI, real-data beta or deployment. Historical scope/authorization statements in older docs describe their checkpoint; consult current source and the latest relevant verification report.
- R1 adds structured application details and activity history; R2 adds mapped CSV preview and atomic import; R3 adds preparation drafts and explicitly preserved submitted copies; R4 adds manual follow-up tasks and derived next actions; R5 adds deliberate hosted Sidekick handoff. Domain rules live in `application.ts`, `csv-import.ts`, `preparation.ts`, `task.ts` and `capture.ts`. PostgreSQL migrations 0012–0014 support R1–R4. See `docs/R5_VERIFICATION.md` for consolidated evidence and its coverage limits.
- The default application state is empty. Maria Santos is an explicitly labeled sample profile, not an authenticated user. Never invent default jobs, statistics, interview dates, or working placeholder actions.
- Preserve all three original moodboards and the additional brand board in `uiux/*.png`. Follow the FATS 3.0 reference for Sidekick and reuse the established web design tokens.

## Architecture and conventions

- pnpm workspace, Nx task orchestration, Next.js App Router, strict TypeScript, Tailwind CSS 4.
- `apps/web/src/app`: route files and shared CSS tokens.
- `apps/web/src/components`: client views, application provider, reusable native components, Radix-backed form dialog.
- `libs/domain/src`: model, validation, creation/update rules, filtering, derived statistics, repository interface. No React, Next.js, or UI imports; ESLint enforces the main boundary.
- `apps/web/src/lib/local-application-repository.ts`: versioned guest local-storage adapter. Keep browser storage details out of UI components and select guest/account repositories through the existing provider boundary.
- The account backend already exists: `http-workspace-repository.ts` calls same-origin Node Route Handlers; `apps/web/src/server` owns Better Auth, owner-scoped PostgreSQL repositories and private storage. `apps/web/migrations` holds checksum-protected, explicitly applied SQL migrations. Never migrate from build/startup or edit applied migrations. Read `apps/web/AGENTS.md` and installed Next.js documentation before web implementation.
- `apps/extension`: independently built MV3 React side panel. Capture only on explicit request with temporary `activeTab` access. Keep bridge origins/path and service-worker sender checks narrow; never put captured fields in URLs or let the extension manage the web repository. See `docs/SIDEKICK.md`.
- Update state only after persistence succeeds. Never erase unreadable storage automatically. Surface actionable read/write errors and preserve form inputs when saving fails.
- All seven statuses are valid manual choices. An Interview status does not imply a scheduled interview.
- Interviews link to existing applications; scheduling never changes application status. Store the UTC instant and explicit IANA timezone together; reject skipped local times and require a choice for repeated times. Application deletion is restricted while any interviews reference it, including completed/cancelled records.
- Backups use an independent versioned format and shared domain validation. Restore requires preview and explicit replacement confirmation; write both collections atomically with one storage operation, preserve saved data on failure, and never include unrelated browser storage.
- The replacement rule above applies to legacy v1 guest backups. Offer Desk/Career Vault v2/v3 imports are additive with preview, duplicate skipping and conflict protection. Preserve R1–R4 metadata and history; CSV import is a separate previewed atomic operation. Submitted preparation copies are explicit snapshots, and task completion never changes recruitment status or schedules interviews.
- Native inputs/selects and explicit labels are preferred. Radix handles modal semantics/focus. Keep links for navigation, buttons for actions, visible focus indicators, and truthful loading/error/empty states.
- No remote fonts or analytics. Account mode uses same-origin APIs and server-only PostgreSQL credentials; guest mode remains local. User source links open only on explicit clicks. Derive record ownership from a live server session, and scope every database operation to that owner.
- Local/test account email goes only to loopback Mailpit; hosted account email uses the configured Resend adapter and verified sender. Never log tokens, codes, reset links, credentials, or raw provider/SMTP/database errors. Require verified email for account access. Defer only delivery, never token persistence. Preserve the narrow auth endpoint allowlist and the library's transactional token/session behavior. See `docs/decisions/0002-account-safety-and-recovery.md` and the D2 verification report.
- Document bytes stay in private persistent storage behind the server-only interface; never use localStorage or public paths. Verify live account ownership for uploads/downloads, enforce quotas and format validation, keep version metadata/bytes immutable, and require explicit submitted-version changes. Archive preserves links; referenced deletion is restricted. JSON exports exclude documents and links. Complete local recovery requires the matching database/manifest/file bundle. See `docs/DOCUMENTS.md`.
- Resume comparison requires local extraction review and explicit external-sharing consent. Never analyze uploads automatically, send raw files/credentials, execute document instructions, invent qualifications, or produce hiring scores. Keep provider calls server-side, bounded, usage-limited, and free of sensitive logs. Validate every citation against the exact reviewed source; preserve resume version, job revision, and configuration in reports. JSON exports exclude reports/reviewed text. Use deterministic labelled fixtures only against the dedicated test database; live-provider evaluation requires explicit authorization. See `docs/MATCHING.md`.
- Matching remains paused/default-off (`FATS_AI_MATCHING_ENABLED=0`); the preceding rules describe retained implementation, not permission to enable it. New document intake fails closed while required scanner integration is unverified. Browser-only PDF Tools does not bypass server document safety. Real-data beta remains blocked; see `docs/PRIVATE_BETA_READINESS.md`.
- PostgreSQL archives contain private authentication data. Follow `docs/DATABASE_RECOVERY.md`: independent explicit restore target, compatibility preview, exact destructive confirmation, stopped application, and disposable restore tests. Never commit dumps/manifest pairs or use user databases as test targets.
- Use pnpm 11 configuration in `pnpm-workspace.yaml`; `.npmrc` is for registry/auth settings only. Keep dependencies pinned and review the lockfile. Keep native build-script approvals explicit.
- Nx `quality` inputs must cover test/config files and the domain/storage sources being tested; do not cache tests without their source dependencies.

## Hosted authentication blocker

- Hosted registration is reported to return “Account storage is temporarily unavailable.” R0 added fixed-category private diagnostics, not a confirmed root-cause repair. Local success and simulated hosted Sidekick tests do not certify hosted accounts. See `docs/R0_HOSTED_AUTH_VERIFICATION.md`.
- The 2026-11-07 read-only hosted checkpoint found migrations 0012–0014 pending and Vercel Authentication protecting all deployments. Those migrations block full R1–R4 account compatibility but do not by themselves explain registration's 503. This is recorded evidence, not a fresh inspection of hosted state.
- Keep TLS certificate verification, schema validation, session/ownership checks and deployment protection intact. Do not decrypt secrets, run migrations, send hosted email, reproduce hosted writes or change infrastructure without separate explicit authorization. Existing hosted adapters and R5's exact `https://fats.edtosoy.com` destination supersede old local-only claims; they do not establish hosted readiness.

## Development tools and manual workflow

- Codex is the coding agent; Git is the source of truth for code; this `AGENTS.md` is authoritative for repository rules. Read applicable nested instructions. Use `implement-feature` for feature work, `fix-bug` for debugging and `verify-changes` before reporting implementation complete. Preserve unrelated work and use a separate task branch.
- Commits, pushes, merges, publishing, deployments, database migrations and cloud changes are manual, explicitly authorized steps. Review the diff and relevant executed checks, propose a commit message, then stop unless the user has authorized the next action. Never install commit/push/deploy automation or new Git hooks as part of tool setup.
- Graphify supplements structural inspection; inspect current source when coverage is incomplete or stale. Keep indexes/caches local and ignored. Use only explicit local AST extraction, never Graphify Cloud, semantic/provider calls, automatic watchers or bulk ingestion without authorization. Do not run its assistant installer over repository instructions. The project Codex config disables the existing globally configured remote `graphify` server for this repository; hosted plugin tools also remain out of scope.
- ICM supplements verified decisions, never code inspection or repository rules. Use only the project SQLite database and explicit reviewed memory writes with a source path/date. Do not copy docs or bulk-ingest sessions/tool output. Never store secrets, authentication material, resumes, job/application records or other private user data. Keep extraction, embeddings/model downloads, cloud sync and summarizer providers disabled.
- Use existing `docs/` as the optional Obsidian vault; edit the same Markdown files, keep `.obsidian/` and `.trash/` ignored, and install no AI plugins. Setup inventory, exact deferred installation commands and local verification are in `docs/AI_DEVELOPMENT.md`.

## Commands

Run from the root with Node 24 LTS and pnpm 11.27.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
pnpm start
pnpm test:e2e
pnpm build:extension
pnpm verify:extension
pnpm test:extension
```

Account/integration checks require the dedicated loopback test database/Mailpit and synthetic fixtures; they may prepare/migrate test state. Only run them when that setup is authorized, following `docs/LOCAL_CONFIGURATION.md` and the relevant verification report:

```sh
pnpm test:integration
pnpm test:e2e:account
pnpm test:e2e:product
pnpm test:extension:account
```

`pnpm test:e2e:matching` and `eval:matching*` relate to paused AI work; do not run live variants without explicit authorization. `db:migrate*`, `db:restore`, `data:cleanup` and document rechecks are operator actions, not routine verification.

`pnpm format` writes formatting. `pnpm dev` runs port 3000; `pnpm start` needs a successful build. See `docs/VERIFICATION.md` for executed results and environment notes. Use `--output-style=static` for Nx logs when needed.

In restricted agents, prefix checks with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` if worker sockets are blocked. Browser tests can use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Keep Chromium's sandbox enabled; request a scoped permission if local sockets are restricted.

If the installed `pnpm` launcher stalls, `corepack pnpm --version` and `corepack pnpm <command>` use the repository-pinned version without replacing global tools. If the pinned package is not already cached, stop before downloading/installing it without authorization.

## Verification

- Unit tests: creation, every status update, validation, filtering/statistics, adapter persistence, corruption and write failures.
- Playwright: real form → repository → local storage → reload → UI at desktop and mobile widths; combined search/filter, detail edits, navigation, modal keyboard behavior, truthful shells, corrupted storage.
- Use isolated test contexts. Do not seed a user's current browser workspace. No seed data is installed by default.
- Check type/lint/unit tests, production build, browser journeys, formatting, and preserved moodboard hashes for significant changes to this slice. Stop after relevant verification passes; do not broaden scope automatically.
- For documentation/tool configuration only, verify formatting, TOML parsing, exclusion rules and the final diff; do not start databases, build the product or run unrelated browser journeys. Tool runtime checks remain NOT RUN until the missing tools are installed. Historical reports record a unit-suite extraction-hash mismatch; do not weaken that assertion or assume it remains the only failure without a fresh run.
