# FATS repository guidance

Use the global working agreements. This file adds repository-specific context; it does not authorize commits, pushes, publishing, deployments, or destructive actions.

## Scope and product invariants

- FATS is a personal job-search companion, primarily for fresh graduates in the Philippines. Employers do not post jobs here. Saving a job does not apply for it.
- Phases 0–6 cover tracking, interviews, JSON backups, Sidekick, local PostgreSQL accounts, email verification/password recovery, private resume/document versions, local database/file recovery, and explicit explainable resume-to-job comparison. Stop after Phase 6. Other AI features, calendar integrations, notifications, crawling, native apps, payments, and cloud deployment require separate authorization.
- The default application state is empty. Maria Santos is an explicitly labeled sample profile, not an authenticated user. Never invent default jobs, statistics, interview dates, or working placeholder actions.
- Preserve all three original `uiux/*.png` moodboards. Follow the FATS 3.0 reference for Sidekick and reuse the established web design tokens.

## Architecture and conventions

- pnpm workspace, Nx task orchestration, Next.js App Router, strict TypeScript, Tailwind CSS 4.
- `apps/web/src/app`: route files and shared CSS tokens.
- `apps/web/src/components`: client views, application provider, reusable native components, Radix-backed form dialog.
- `libs/domain/src`: model, validation, creation/update rules, filtering, derived statistics, repository interface. No React, Next.js, or UI imports; ESLint enforces the main boundary.
- `apps/web/src/lib/local-application-repository.ts`: versioned local-storage adapter. Keep browser storage details out of UI components. Replace/inject the repository when introducing a backend.
- `apps/extension`: independently built MV3 React side panel. Capture only on explicit request with temporary `activeTab` access. Keep bridge origins/path and service-worker sender checks narrow; never put captured fields in URLs or let the extension manage the web repository. See `docs/SIDEKICK.md`.
- Update state only after persistence succeeds. Never erase unreadable storage automatically. Surface actionable read/write errors and preserve form inputs when saving fails.
- All seven statuses are valid manual choices. An Interview status does not imply a scheduled interview.
- Interviews link to existing applications; scheduling never changes application status. Store the UTC instant and explicit IANA timezone together; reject skipped local times and require a choice for repeated times. Application deletion is restricted while any interviews reference it, including completed/cancelled records.
- Backups use an independent versioned format and shared domain validation. Restore requires preview and explicit replacement confirmation; write both collections atomically with one storage operation, preserve saved data on failure, and never include unrelated browser storage.
- Native inputs/selects and explicit labels are preferred. Radix handles modal semantics/focus. Keep links for navigation, buttons for actions, visible focus indicators, and truthful loading/error/empty states.
- No remote fonts or analytics. Account mode uses same-origin APIs and server-only PostgreSQL credentials; guest mode remains local. User source links open only on explicit clicks. Derive record ownership from a live server session, and scope every database operation to that owner.
- Local/test account email goes only to loopback Mailpit; hosted account email uses the configured Resend adapter and verified sender. Never log tokens, codes, reset links, credentials, or raw provider/SMTP/database errors. Require verified email for account access. Defer only delivery, never token persistence. Preserve the narrow auth endpoint allowlist and the library's transactional token/session behavior. See `docs/decisions/0002-account-safety-and-recovery.md` and the D2 verification report.
- Document bytes stay in private persistent storage behind the server-only interface; never use localStorage or public paths. Verify live account ownership for uploads/downloads, enforce quotas and format validation, keep version metadata/bytes immutable, and require explicit submitted-version changes. Archive preserves links; referenced deletion is restricted. JSON exports exclude documents and links. Complete local recovery requires the matching database/manifest/file bundle. See `docs/DOCUMENTS.md`.
- Resume comparison requires local extraction review and explicit external-sharing consent. Never analyze uploads automatically, send raw files/credentials, execute document instructions, invent qualifications, or produce hiring scores. Keep provider calls server-side, bounded, usage-limited, and free of sensitive logs. Validate every citation against the exact reviewed source; preserve resume version, job revision, and configuration in reports. JSON exports exclude reports/reviewed text. Use deterministic labelled fixtures only against the dedicated test database; live-provider evaluation requires explicit authorization. See `docs/MATCHING.md`.
- PostgreSQL archives contain private authentication data. Follow `docs/DATABASE_RECOVERY.md`: independent explicit restore target, compatibility preview, exact destructive confirmation, stopped application, and disposable restore tests. Never commit dumps/manifest pairs or use user databases as test targets.
- Use pnpm 11 configuration in `pnpm-workspace.yaml`; `.npmrc` is for registry/auth settings only. Keep dependencies pinned and review the lockfile. Keep native build-script approvals explicit.
- Nx `quality` inputs must cover test/config files and the domain/storage sources being tested; do not cache tests without their source dependencies.

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

`pnpm format` writes formatting. `pnpm dev` runs port 3000; `pnpm start` needs a successful build. See `docs/VERIFICATION.md` for executed results and environment notes. Use `--output-style=static` for Nx logs when needed.

In restricted agents, prefix checks with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` if worker sockets are blocked. Browser tests can use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Keep Chromium's sandbox enabled; request a scoped permission if local sockets are restricted.

## Verification

- Unit tests: creation, every status update, validation, filtering/statistics, adapter persistence, corruption and write failures.
- Playwright: real form → repository → local storage → reload → UI at desktop and mobile widths; combined search/filter, detail edits, navigation, modal keyboard behavior, truthful shells, corrupted storage.
- Use isolated test contexts. Do not seed a user's current browser workspace. No seed data is installed by default.
- Check type/lint/unit tests, production build, browser journeys, formatting, and preserved moodboard hashes for significant changes to this slice. Stop after relevant verification passes; do not broaden scope automatically.
