# Sidebar momentum

Your momentum is a small reflection of saved job-search work. It has no targets,
notifications, rewards, ranking, or AI processing. The existing sidebar width stays
235px (210px at its existing breakpoint); mobile shows it in the navigation panel.

## Calendar and counting

- All workspaces use **Asia/Manila**, regardless of device timezone or travel.
  A day runs from local midnight to the next midnight. The label says Philippine
  time; the seven marks represent the current Monday–Sunday week.
- A date counts once, regardless of how many meaningful actions were saved.
  Future dates never contribute. A current streak ends today if today is active,
  otherwise yesterday: today remains open. A full intervening inactive day ends
  the streak. Breaks do not erase past active dates or produce guilt-based copy.
- Saving an application, changing its persisted details/status, recording an
  interview, or changing interview details/preparation/reflections counts.
  Normalized unchanged submissions and duplicate Sidekick captures do not.
- Account documents count after validated, scanned, accepted bytes are published
  successfully. Content already present in that owner's library does not count.
  Renames, default/archive settings, associations, downloads, rejected uploads,
  quarantined files, and passive views do not count. Different bytes are the
  content-change signal; no semantic comparison or automatic extraction is added.
- Account offer terms, negotiation notes, decisions, and review checklist/questions
  count when substantive saved values change. Retrying a request, resubmitting the
  same values with another request ID, or changing only its occurrence date does
  not add activity. Offer received dates and interview scheduled dates never stand
  in for the time of doing the work.

## Persistence and historical evidence

The domain calendar is in `libs/domain/src/momentum.ts`. Guest active dates are an
optional `activityDays` array in the existing version 1 local-storage envelope.
The action and date use one atomic storage write; failed writes preserve both.
Old envelopes still work. Malformed activity is reported without clearing storage.
Existing guest multi-tab read/modify/write limitations remain those of the local
workspace adapter.

Account migration `0011_momentum.sql` adds `momentum_days`, keyed by live-session
owner and date, with cascading account deletion. Mutations record a date within
their existing transaction, using `ON CONFLICT DO NOTHING`; rollbacks, concurrency,
and idempotent retries cannot inflate it. Applications/interviews use their saved
action timestamp; document/offer actions use the transaction timestamp. The
existing private workspace response includes the dates. There is no new public
endpoint or client-supplied ownership/date field. Document/offer saves refresh this
snapshot through the existing application provider and workspace broadcast.

Historical evidence is limited to immutable application/interview creation times,
first accepted versions of distinct document content, and the first recorded offer
terms. Mutable `updatedAt`, old status changes, old reviews, deletions, and missing
history are not reconstructed. Restored/imported records can establish their
original creation dates; restoring or importing does not award today's date.
Dates in the ledger remain when their source record is deleted. Guest and account
workspaces remain separate. Signing in alone awards no activity.

Portable JSON backups intentionally retain their existing formats and exclude the
extra date ledger. An account's complete database archive includes the table; the
recovery table allowlist includes it. Guest restore preserves the current ledger
and derives the incoming records' actual creation dates. Unreadable workspace or
expired-session states show unavailable activity instead of invented zeroes.

## Verification

Focused tests cover calendar midnight, equivalent timezone offsets, DST elsewhere,
week/month/year and leap-day boundaries, gaps, today/yesterday streak behavior,
future dates, repeat actions, guest atomic failures, restore/export behavior,
PostgreSQL concurrency/ownership, document quarantine and content deduplication,
offer review deduplication, and guest/account browser persistence and separation.
Browser evidence uses isolated synthetic data and Chromium with its sandbox on.
Executed locally on 2026-10-18 with Node 24.21.0 and pnpm 11.27.0:

| Result                         | Check                                                                                                                                                        | Evidence                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS                           | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck` and `pnpm lint` with the same prefixes                                                             | All four workspace targets.                                                                                                                                                                                                                                                                                                                         |
| PASS                           | `pnpm format:check`, `git diff --check`                                                                                                                      | Formatting and whitespace.                                                                                                                                                                                                                                                                                                                          |
| PASS                           | Focused Vitest run of momentum, application, interview, local/interview/backup repositories, backup, capture, and upload-security unit files                 | 155 tests across nine files.                                                                                                                                                                                                                                                                                                                        |
| PASS                           | Integration runs of momentum, postgres, documents, offers, and database-operations using `vitest.integration.config.ts` and the dedicated `.env.phase4-test` | 47 tests total across five files on their final relevant runs; includes five new momentum tests and six disposable backup/recovery drills. The archive restores the ledger and all 11 migrations.                                                                                                                                                   |
| PASS                           | Playwright combined applications/momentum run; final `pnpm exec playwright test tests/e2e/momentum.spec.ts --workers=1`                                      | 14 existing application journeys passed; all four final momentum journeys passed. Desktop/mobile, actual forms and reloads, no unexpected page/console errors.                                                                                                                                                                                      |
| PASS                           | `FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3101 pnpm test:e2e:account tests/account-e2e/accounts.spec.ts -g momentum`                                            | Two production browser journeys: guest isolation, verified-account save, reload, logout, fresh sign-in, and no changes to guest storage. AI configuration disabled.                                                                                                                                                                                 |
| PASS                           | `pnpm --filter @fats/web exec next build --webpack`                                                                                                          | Optimized production compilation, TypeScript, static pages and routes.                                                                                                                                                                                                                                                                              |
| PASS                           | Visual inspection                                                                                                                                            | Empty/active light and dark states; 1916 × 952, 1024 × 768, 800 × 700, and 390px screens. Original viewport asserts no sidebar overflow and a visible profile. Smaller desktop heights allow sidebar scrolling; mobile uses the navigation panel.                                                                                                   |
| PASS                           | Original `uiux/*.png` SHA-256 comparison                                                                                                                     | All four reference files match the starting hashes.                                                                                                                                                                                                                                                                                                 |
| FAIL, external to this feature | Full `pnpm test`                                                                                                                                             | 246/248 passed with scoped local-service access. The frozen AI comparison-plan hash expects `23dd…bcb` for `resume-extraction.ts`; both HEAD and the untouched working file hash to `f679…973`. The other failure was parser capacity under parallel load; the upload-security test passed in the focused rerun. No AI/provider calls were enabled. |
| Environment limitation         | Default `pnpm build`                                                                                                                                         | Turbopack's CSS worker could not bind its local port (`EPERM`). The supported webpack production build passed; no project bundler setting was changed.                                                                                                                                                                                              |

Scoped environment permissions were required for the isolated PostgreSQL/Mailpit
services, browser sockets, and the existing systemd/bubblewrap document parser.
The first document-audit retry exposed a synthetic owner left by an earlier failed
new-test teardown; cleanup was restricted to that task's synthetic owners and the
corrected document suite passed all seven tests. No user's database or browser
workspace was used. Migration 0011 was applied only to dedicated test databases;
account installations need the normal `pnpm db:migrate` step before use.

Inspected screenshots are retained locally in the ignored
`test-results/momentum-evidence/` directory (desktop empty/active/dark, 1024/800/390,
and mobile empty/active/dark). No images were uploaded. Full accessibility auditing,
Firefox/WebKit, native iOS, and a production migration/deployment were not run.
