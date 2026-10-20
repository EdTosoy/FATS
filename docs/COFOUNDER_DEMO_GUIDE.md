# Local co-founder walkthrough

This is a supervised, fully synthetic local demonstration. **It is not ready
for real personal-data beta testing.** AI stays disabled, Mailpit stays on
loopback, and the browser never contacts an employer. No public deployment,
paid infrastructure, ClamAV installation or upload-security exception is needed.

The fictional graduate is **Alex Rivera**, a 2026 Information Systems graduate
learning to explain a student SQL/dashboard project. Harborlight Labs and
Luntian Software are fictional employers. Dates deliberately compress a job
search into a retrospective October 2026 story. Nothing shown is a real offer,
application, employment verification or employer-issued document.

## An honest limit before presenting

Required scanning is unavailable. **Resume versions cannot currently be uploaded,
accepted, submitted, previewed or managed as working library files in this
rehearsal.** Two synthetic resume revisions are supplied as local PDFs to explain
the intended workflow. The live demonstration exercises the real 503 safety gate,
preserved draft and empty library. Do not insert accepted versions, fabricate scan
receipts or use a test scanner to make that segment look complete.

Career Vault works with metadata and paper-copy tracking. PDF Tools works on an
explicitly selected local file. Neither is a workaround for library scanning.

## Prepare the isolated workspace

Use Node 24 LTS and pnpm 11.27.0 with the already-installed dependencies and
Chromium. Run from the repository root in a development shell. The exact Sidekick
bridge requires **http://127.0.0.1:3000**; localhost is a different workspace.
Keep port 3000 free. Do not stop another person's server to obtain it.

```sh
pnpm db:test:up
pnpm mail:test:up
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm demo:prepare
pnpm demo:start
```

The existing database helper uses only the labelled disposable PostgreSQL
container, database `fats_phase4_test` on loopback port 16432. The separate inbox
uses SMTP 11025 / UI 18025. Private configuration stays in ignored
`.env.phase4-test`; credentials are never printed. No normal development database
or existing browser workspace is seeded. Preparation applies existing migrations
to the dedicated test database, runs the full browser journey and stops its test
web server. `demo:start` then starts the same optimized application against that
isolated database. It refuses production-shell execution and unexpected database
identity; it overrides AI/provider/scanner configuration to the paused state.

`demo:prepare` builds/verifies the extension, then uses normal UI registration,
the actual local verification email, sign-in, user-confirmed Sidekick capture,
forms and supported recovery. It creates a **fresh account on every run**. It has
no reset, database wipe, privileged authentication or accepted-file seeding path.

Find the generated directory through `.fats-private/cofounder-demo/latest.json`.
Open its `credentials.json` privately in your editor and sign in in a separate
demo browser profile. Do not put credentials, codes, cookies, deletion receipts or
inbox contents in screenshots, shared notes or terminal output. Generated files
are ignored by Git; the credentials file is mode 0600 under a private directory.

The directory contains:

- `workspace.json`: saved application/interview URLs and the employment ID.
- `alex-synthetic-backup.json`: version 3 application/interview/offer/vault
  metadata and history. No document bytes, live file links or Momentum ledger.
- `alex-resume-v1-synthetic.pdf` and `alex-resume-v2-synthetic.pdf`: local-only
  revisions, not accepted library files.
- `synthetic-employment-form.pdf` and
  `completed-synthetic-employment-form.pdf`: generated PDF Tools examples.

The prepared account has two opportunities, two completed interview rounds, a
PHP 28,000 → PHP 30,000 monthly offer revision, HR questions, acceptance history,
one explicitly created employment record and requested/received contract history.
The second account used to prove recovery is erased through the public,
authenticated erasure endpoint. The presenter account is retained only after the
whole preparation passes. Ordinary `test:e2e:product` runs erase their accounts.

For live Sidekick capture, load `apps/extension/dist` as an unpacked extension in
the isolated desktop Chromium profile. Serve the supplied fictional listing in a
second terminal:

```sh
python3 -m http.server 3400 --bind 127.0.0.1 --directory tests/fixtures/jobs
```

Open <http://127.0.0.1:3400/synthetic-graduate.html>. Automated preparation serves
these exact bytes through local browser interception; it contacts no job board.
Capturing this same listing again returns the existing record without duplicating
it. The extension needs an explicit toolbar click to grant temporary active-tab
access. Native side-panel installation/pinning is a presenter setup step; the
automated browser drives the packaged panel in an extension tab.

## The 9-minute story

Use the prepared account for a reliable short walkthrough. Registration and full
record creation are rehearsed by the automated journey; repeating every form live
would turn the presentation into data entry. A separate fresh account can show
the real empty start if desired. There is no new onboarding wizard: dashboard
guidance and Help explain save → apply externally → update progress.

| Time      | Show and say                                                                                                                                                                                                                                        | User value / truthful boundary                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:45 | “Alex has graduated and is trying to keep track of two promising roles.” Open Dashboard, then briefly show Help's first three steps. For a fresh account, register, verify via the private local inbox and use **Open your dashboard** in Settings. | A calm starting point with real counts and one next action. Saving is separate from applying. Mail is local only.                                                                                      |
| 0:45–1:45 | Open Junior Data Analyst. Show the original link and short description. Open the synthetic QA listing, use Sidekick **Capture Job → Review details → Open FATS to confirm → Confirm and save**.                                                     | Keep useful details without retyping. Final confirmation is required; repeating this prepared capture opens the existing record. No job application is submitted.                                      |
| 1:45–2:30 | Return to the analyst application. Review its manually chosen stage and the two linked interview rounds. Open the project conversation and its preparation/reflection notes.                                                                        | Alex's project story and lessons stay beside the opportunity. Completed interviews do not silently change the application stage.                                                                       |
| 2:30–3:10 | Open Resumes. Choose the supplied synthetic resume PDF and submit once to show the safety-check error and retained form inputs; close the form. Explain the two local resume revisions.                                                             | Be candid: safe library version management is blocked until operational scanning is authorized and verified. There is no working upload demonstrated.                                                  |
| 3:10–4:45 | Return to the analyst's Offer Desk. Expand **Review current terms** and **Offer history** to show PHP 28,000 → PHP 30,000. Open the checklist and HR questions, then cancel.                                                                        | The graduate can understand an incomplete offer, keep questions and see what changed. FATS records decisions; it does not email HR, legally accept terms or provide legal advice.                      |
| 4:45–6:15 | Show **Acceptance recorded**, then **Plan employment in Career Vault**. Open the employment record and its history: first Not started, then the explicitly recorded Current state. Show the requested/received contract entry.                      | An accepted offer never automatically becomes confirmed employment. Optional prefill avoids retyping; the person confirms dates/status and saves. Received records a paper copy; no attachment exists. |
| 6:15–7:15 | From Career Vault, open local PDF Tools. Select `synthetic-employment-form.pdf`, type a short name mark and download a copy.                                                                                                                        | Useful paperwork help without uploading. Bytes and signature marks stay in this browser; the output is not stored in the library or vault. A drawn/typed mark is not a certified signature.            |
| 7:15–8:15 | Open Settings → Data management. Export a new backup, select it and preview import. Show applications, interviews, offers and vault counts, then cancel.                                                                                            | Alex can keep an independent copy and inspect recovery before changing data. JSON is private/unencrypted and excludes actual files, live links, PDF drafts and the extra Momentum ledger.              |
| 8:15–9:00 | Switch Light/Dark in Appearance, return to Dashboard and open mobile navigation if showing the narrow layout.                                                                                                                                       | The same workspace remains coherent. Appearance persists; passive browsing, theme changes, rejected uploads and previews do not earn extra Momentum. Finish with the next step Alex actually needs.    |

Do not click external source URLs as part of the presentation; `example.test`
addresses are deliberately fictional. No calendar events, notifications, messages
or employer/government requests are sent. The local listing itself is safe to open.

## Repeat and reset

For another rehearsal, stop only your own `demo:start` process, then run
`pnpm demo:prepare` again. It creates a separate synthetic account and new artifact
directory; previous accounts/records are kept. Never run the repository's
disposable-database stop/reset helper merely to reset this account; that discards
other synthetic test work too.

To erase a retained demo account, sign into that exact account, open Settings,
choose **Delete account…**, read the warning, type **DELETE MY ACCOUNT**, check the
consequences box and explicitly confirm. Wait for completed cleanup; retain the
private receipt and retry if pending. Confirm the former workspace is inaccessible.
Delete only the matching generated artifact directory and that synthetic account's
Mailpit messages when you deliberately want to remove your independent copies.
Account erasure does not delete downloads, inbox copies, browser drafts or old
operator archives. No destructive reset command is added or automatically run.

The dedicated database is disposable and not durable demo storage. Before a later
session, recheck the services and rerun preparation if necessary. Supported JSON
can restore the metadata through a verified account and explicit preview/import;
it cannot recover accepted library bytes. Complete operational recovery still
requires the matching database/manifest/private-file bundle and its separate
runbook.

## Presenter stop conditions and beta blockers

Stop if port 3000 is occupied, the database identity is unexpected, a real person's
data appears, account verification fails, the save shows an error, a relationship
is missing, or required upload checks appear to be bypassed. Keep drafts open on
save failure; do not improvise a database repair during the presentation.

Real scanning, intended-runtime containment/headroom and monitoring, hosted
email/HTTPS/restricted access, durable encrypted off-device recovery,
retention/deletion/backup-WAL policy, incident/privacy/support owners and broader
accessibility evidence remain open. Local screenshots and passing tests do not
close these blockers. See [product integration verification](PRODUCT_INTEGRATION_VERIFICATION.md)
and [readiness](PRIVATE_BETA_READINESS.md).
