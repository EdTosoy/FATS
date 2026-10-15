# FATS

A friendly job-search companion for fresh graduates in the Philippines. FATS tracks opportunities you find elsewhere; it does not host employer job postings or submit applications.

## Run locally

Use Node 24 LTS and pnpm 11.27.0 (pinned in `package.json`). The local guest workspace runs without a database. Accounts require the optional local PostgreSQL setup below.

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

`pnpm start` serves the production build after `pnpm build`; stop the development server first. `pnpm format` formats source and documentation. Nx orchestrates the `web`, `extension`, `domain`, and `quality` projects with local caching; Nx Cloud is not configured.

Playwright uses an existing system Chromium when available. Otherwise install its matching browser with `pnpm exec playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to your Chromium executable. On Linux, the browser also needs its OS dependencies. Chromium's sandbox stays enabled. E2E tests start a local development server at `127.0.0.1:3000` and use isolated browser contexts and synthetic jobs.

In a restricted agent environment, Nx checks can use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` to avoid worker sockets. Local servers, builds using worker processes, and Chromium may require a command-specific environment permission. Don't change system-wide sandbox settings for the repository.

## FATS Sidekick — Chrome extension

```sh
pnpm build:extension
pnpm verify:extension
pnpm test:extension
```

Builds are independent: `pnpm build` builds the website; `pnpm build:extension` creates the unpacked Manifest V3 package in `apps/extension/dist`. The verifier checks its permissions, bridge scope, and local bundles. Extension tests build/verify the package and start the local FATS server automatically; stop other servers on port 3000 first.

For manual use, run `pnpm dev`. In Chrome 116 or newer, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension/dist`. Pin FATS Sidekick, open a job page, and click its toolbar icon to grant temporary access and open the panel. Choose **Capture Job**, correct missing/extracted details or paste them manually, then **Review details → Open FATS to confirm**. Choose the same local hostname as your tracker. In FATS, review again and select **Confirm and save**. Reload to check persistence. After rebuilding, use Chrome's extension Reload action and refresh FATS; pending handoffs are cleared.

Capture supports JobPosting JSON-LD and basic metadata/semantic HTML, with manual editing for every field. It makes no site-specific compatibility promise and never applies for you. It requests `activeTab`, `scripting`, `sidePanel`, and `storage`, without all-sites host access. Only `http://localhost:3000` and `http://127.0.0.1:3000` are supported FATS destinations. Handoffs expire after 15 minutes; unsent panel drafts are lost when the panel closes or reloads. The extension does not read or write website storage. See [Sidekick architecture, privacy, and testing](docs/SIDEKICK.md).

## Documentation

- [Product and assumptions](docs/PRODUCT.md)
- [Architecture and dependency decisions](docs/ARCHITECTURE.md)
- [Scope and next steps](docs/ROADMAP.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Verification evidence](docs/VERIFICATION.md)
- [Phase 2 verification](docs/PHASE_2_VERIFICATION.md)
- [Local backups and recovery](docs/BACKUPS.md)
- [Phase 2.1 verification](docs/PHASE_2_1_VERIFICATION.md)
- [Sidekick developer guide](docs/SIDEKICK.md)
- [Phase 3 verification](docs/PHASE_3_VERIFICATION.md)
- [Phase 4 verification](docs/PHASE_4_VERIFICATION.md)
- [Authentication and persistence decision](docs/decisions/0001-authentication-and-persistence.md)
- [Phase 5 verification](docs/PHASE_5_VERIFICATION.md)
- [Private documents and versions](docs/DOCUMENTS.md)
- [Explainable resume comparison](docs/MATCHING.md)
- [Phase 6 verification](docs/PHASE_6_VERIFICATION.md)
- [Phase 6.1 evaluation preparation and authorization](docs/PHASE_6_1_VERIFICATION.md)
- [Phase 4.1 verification](docs/PHASE_4_1_VERIFICATION.md)
- [Account safety decision](docs/decisions/0002-account-safety-and-recovery.md)
- [PostgreSQL backup and recovery](docs/DATABASE_RECOVERY.md)

The three original moodboards are preserved in `uiux/`. Source lives in `apps/web/`, `apps/extension/`, and `libs/domain/`; tests live in `tests/`.

## Accounts and local PostgreSQL — Phase 4.1

Next.js Route Handlers use Better Auth email/password accounts and PostgreSQL. NestJS would add another runtime and cookie/CORS boundary without a current need; see [ADR 0001](docs/decisions/0001-authentication-and-persistence.md).

With Docker available, run:

```sh
pnpm db:configure
pnpm db:up
pnpm db:migrate
pnpm dev
```

`db:configure` generates private random credentials in ignored `apps/web/.env.local`, refusing to overwrite an existing file. PostgreSQL 17 listens only on loopback port 5433 and keeps development records in a named Docker volume. Mailpit receives development email on loopback SMTP port 1025; view its local inbox at <http://127.0.0.1:8025>. It does not deliver to real recipients or require email credentials. Treat its messages as private: verification codes and reset links grant account access. `db:stop` stops both services without deleting the database volume. Alternatively run PostgreSQL locally and fill in the variables documented in [local configuration guide](docs/LOCAL_CONFIGURATION.md); local SMTP testing is still required for accounts. Run migrations before starting the web process; restart it after schema/configuration changes. No cloud resources are created. Never commit the environment file.

Open Settings → Sign in to an account to register. Passwords require 12–128 characters. Enter the eight-digit code from Mailpit to verify the address, then sign in. Codes expire after 10 minutes; only the newest code works, once. Existing unverified accounts retain their records and must verify before opening the account workspace. Use **Verify your email** or **Forgot password?** on the sign-in screen for recovery. Reset links expire after 30 minutes, work once, and sign out all sessions when used. Email requests show the same generic feedback whether an account exists. Resend/reset requests are limited to three per minute across this local server; wait a minute if asked.

Signed-in applications and interviews belong to that account and survive browser-data deletion. Local browser records stay separate: Settings → Preview browser transfer shows counts and requires explicit confirmation before an additive copy. IDs, timestamps, notes, statuses, and links are retained; conflicting IDs stop the transfer. Original browser data is never deleted. An interrupted confirmation can be retried safely. For local recovery, sign out, export the local workspace, and keep the original backup before repairing anything.

Settings → Data management exports and restores the **current** workspace: account when signed in, browser when signed out. The private, unencrypted version 1 JSON format remains compatible. Restore previews counts and requires confirmation for full replacement; it is separate from additive migration. Account backups exclude passwords and sessions. Export important records regularly; a database volume is not an independent backup.

Use this separate disposable test database for account verification:

```sh
pnpm db:test:up
pnpm mail:test:up
pnpm test:integration
pnpm test:e2e:account
pnpm test:extension:account
pnpm mail:test:stop
pnpm db:test:stop
```

The database helper generates ignored `.env.phase4-test`, uses loopback port 16432, and discards **test** records on stop. Test Mailpit uses SMTP 11025 and inbox <http://127.0.0.1:18025>, with only synthetic accounts. Integration/browser checks never fall back to the development database. Run browser suites sequentially: they use the same port and Next build directory. `pnpm test:e2e` and `pnpm test:extension` explicitly disable account configuration to cover guest workflows. Use an exact `BETTER_AUTH_URL` matching the hostname you open; the two permitted Sidekick origins remain separate browser workspaces.

Use the [database recovery runbook](docs/DATABASE_RECOVERY.md) for private PostgreSQL archives, compatibility checks, and explicitly confirmed restoration. JSON workspace exports remain available and exclude authentication data; database dumps contain password hashes and require operator care. A disposable real restore is covered by the integration suite.

This remains a local foundation. Hosted email delivery, trusted-proxy and abuse policies, and deployment-specific recovery drills require separate work before inviting external users. Runtime account configuration refuses hosted origins while mail goes to a local inbox. Payments, calendar sync, notifications, crawling, and cloud deployment remain outside this slice. Phases 5–6 add private documents and an optional explicit AI comparison below. See [Phase 4.1 evidence and limitations](docs/PHASE_4_1_VERIFICATION.md).

## Private resumes and documents — Phase 5

Run `pnpm db:migrate`, configure an absolute persistent private `FATS_DOCUMENTS_DIR` in `apps/web/.env.local`, and restart FATS. Newly generated configuration includes an ignored `apps/web/.fats-private/documents` path; existing configuration is never overwritten. Only verified accounts can upload PDF/DOCX files. Guest tracking and Sidekick remain available.

Open **Resumes** to upload, search, categorize, rename, preview supported PDFs, download, add versions, set a default resume, and archive documents. Application details explicitly record an exact submitted resume version. Uploading a new version never changes that record. Linked documents cannot be deleted; unlinked deletion requires confirmation. Limits are 10 MiB/file, 100 MiB/account including earlier/archived versions, 50 documents, and 20 versions/document.

Settings JSON exports exclude document metadata, files, and submitted links. A complete operator backup consists of the PostgreSQL dump, version 2 manifest, and matching `.dump.documents/` content. Restore requires a separately selected database and fresh private file directory. `pnpm documents:check` audits file integrity without removing anything. See [document architecture and limits](docs/DOCUMENTS.md), [recovery instructions](docs/DATABASE_RECOVERY.md), and [executed Phase 5 verification](docs/PHASE_5_VERIFICATION.md).

## Explainable resume comparison — Phase 6

Signed-in users can choose an exact resume version on an application, review locally extracted PDF/DOCX and saved job text, then explicitly consent to sending that reviewed text for comparison. Reports show quoted requirements, supporting excerpts, partial/undocumented/unclear qualifications, and cautious suggestions. No scores, fabricated qualifications, automatic analysis, resume rewriting, or application changes are included. New resume uploads leave old reports intact; changed job descriptions visibly mark earlier reports outdated.

Run `pnpm db:migrate`. Comparison stays honestly unavailable until a local operator configures `FATS_AI_PROVIDER=openai` and a private server-only `OPENAI_API_KEY`, then restarts FATS. The initial adapter pins OpenAI `gpt-5.4-mini-2026-03-17` with structured output, bounded requests, timeouts, and default daily limits of 5 attempts/account and 20 globally. Failures can consume provider charges and local limits. Contact removal is best effort; review all text before sharing. `store:false` does not guarantee zero provider retention. See [configuration, privacy, costs, extraction and evidence limits](docs/MATCHING.md).

Reports reference exact resume/job/configuration snapshots and can be explicitly deleted. They expire after 30 days, with deletion on later comparison access rather than a scheduled purge. Settings JSON exports exclude reports/reviewed text; full operator archives include them. Referenced documents/applications and JSON replacement remain protected until reports are explicitly deleted, alongside existing reference rules. Run `pnpm test:e2e:matching` with the disposable test services for clearly labelled deterministic browser checks; no live provider is used. [Phase 6 verification](docs/PHASE_6_VERIFICATION.md) records actual results and remaining gaps. Stop after Phase 6.

Phase 6.1 adds evaluation tooling only: `pnpm eval:matching` prepares 20 synthetic PDF/DOCX scenarios without provider calls. Live evaluation requires a separately approved exact plan, spending/request ceilings and a private key; `eval:matching:live` must never be run as an ordinary regression check. [The evaluation report](docs/PHASE_6_1_VERIFICATION.md) records prepared expectations, deterministic findings, privacy/budget controls, executed checks and current execution status. No live-model accuracy is claimed before that run and manual review.
