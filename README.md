# FATS

A friendly job-search companion for fresh graduates in the Philippines. FATS tracks opportunities you find elsewhere; it does not host employer job postings or submit applications.

## Run locally

Use Node 24 LTS and pnpm 11.27.0 (pinned in `package.json`). No credentials, environment file, backend, or database are needed.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. The demo profile is Maria Santos; the application list starts empty. Use **Save a job**, open its detail page, and update its status. Use **Schedule interview** to link a conversation, select its date/time and timezone, then prepare and reflect in its detail page. Interviews and the dashboard show the same upcoming records. Reload to confirm persistence. Use the same hostname and port each time: `localhost` and `127.0.0.1` have separate browser storage.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
pnpm start
pnpm test:e2e
```

`pnpm start` serves the production build after `pnpm build`; stop the development server first. `pnpm format` formats source and documentation. Nx orchestrates the `web`, `domain`, and `quality` projects with local caching; Nx Cloud is not configured.

Playwright uses an existing system Chromium when available. Otherwise install its matching browser with `pnpm exec playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to your Chromium executable. On Linux, the browser also needs its OS dependencies. Chromium's sandbox stays enabled. E2E tests start a local development server at `127.0.0.1:3000` and use isolated browser contexts and synthetic jobs.

In a restricted agent environment, Nx checks can use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` to avoid worker sockets. Local servers, builds using worker processes, and Chromium may require a command-specific environment permission. Don't change system-wide sandbox settings for the repository.

## Documentation

- [Product and assumptions](docs/PRODUCT.md)
- [Architecture and dependency decisions](docs/ARCHITECTURE.md)
- [Scope and next steps](docs/ROADMAP.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Verification evidence](docs/VERIFICATION.md)
- [Phase 2 verification](docs/PHASE_2_VERIFICATION.md)
- [Local backups and recovery](docs/BACKUPS.md)
- [Phase 2.1 verification](docs/PHASE_2_1_VERIFICATION.md)

The three original moodboards are preserved in `uiux/`. Source lives in `apps/web/` and `libs/domain/`; tests live in `tests/`.

This version stores applications, manual interviews, and plain-text notes only in this browser. There is no authentication, encryption, device sync, resume upload, calendar sync, reminders, or automatic capture. Clearing site data removes all saved records. Use Settings → Data management to download a private, unencrypted JSON backup and preview/confirm a full restore. Backups include applications and interviews, not resume files. Keep the downloaded file safely; browser storage is not a durable backup.
