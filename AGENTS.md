# FATS repository guidance

Use the global working agreements. This file adds repository-specific context; it does not authorize commits, pushes, publishing, deployments, or destructive actions.

## Scope and product invariants

- FATS is a personal job-search companion, primarily for fresh graduates in the Philippines. Employers do not post jobs here. Saving a job does not apply for it.
- Phase 0, Phase 1 application tracking, Phase 2 manual interview management, and Phase 2.1 local backup/recovery are implemented here. Resume uploads, calendar integrations, notifications, accounts, backend, AI, crawling, extensions, native apps, and payments remain outside this slice.
- The default application state is empty. Maria Santos is an explicitly labeled sample profile, not an authenticated user. Never invent default jobs, statistics, interview dates, or working placeholder actions.
- Preserve all three original `uiux/*.png` moodboards. The Job Tracker reference is primary.

## Architecture and conventions

- pnpm workspace, Nx task orchestration, Next.js App Router, strict TypeScript, Tailwind CSS 4.
- `apps/web/src/app`: route files and shared CSS tokens.
- `apps/web/src/components`: client views, application provider, reusable native components, Radix-backed form dialog.
- `libs/domain/src`: model, validation, creation/update rules, filtering, derived statistics, repository interface. No React, Next.js, or UI imports; ESLint enforces the main boundary.
- `apps/web/src/lib/local-application-repository.ts`: versioned local-storage adapter. Keep browser storage details out of UI components. Replace/inject the repository when introducing a backend.
- Update state only after persistence succeeds. Never erase unreadable storage automatically. Surface actionable read/write errors and preserve form inputs when saving fails.
- All seven statuses are valid manual choices. An Interview status does not imply a scheduled interview.
- Interviews link to existing applications; scheduling never changes application status. Store the UTC instant and explicit IANA timezone together; reject skipped local times and require a choice for repeated times. Application deletion is restricted while any interviews reference it, including completed/cancelled records.
- Backups use an independent versioned format and shared domain validation. Restore requires preview and explicit replacement confirmation; write both collections atomically with one storage operation, preserve saved data on failure, and never include unrelated browser storage.
- Native inputs/selects and explicit labels are preferred. Radix handles modal semantics/focus. Keep links for navigation, buttons for actions, visible focus indicators, and truthful loading/error/empty states.
- No remote fonts, analytics, credentials, or network calls are needed at runtime. User source links open only on explicit clicks.
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
```

`pnpm format` writes formatting. `pnpm dev` runs port 3000; `pnpm start` needs a successful build. See `docs/VERIFICATION.md` for executed results and environment notes. Use `--output-style=static` for Nx logs when needed.

In restricted agents, prefix checks with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` if worker sockets are blocked. Browser tests can use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Keep Chromium's sandbox enabled; request a scoped permission if local sockets are restricted.

## Verification

- Unit tests: creation, every status update, validation, filtering/statistics, adapter persistence, corruption and write failures.
- Playwright: real form → repository → local storage → reload → UI at desktop and mobile widths; combined search/filter, detail edits, navigation, modal keyboard behavior, truthful shells, corrupted storage.
- Use isolated test contexts. Do not seed a user's current browser workspace. No seed data is installed by default.
- Check type/lint/unit tests, production build, browser journeys, formatting, and preserved moodboard hashes for significant changes to this slice. Stop after relevant verification passes; do not broaden scope automatically.
