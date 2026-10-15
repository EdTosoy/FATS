# Product

## Current slice — Phase 5

The Phase 0–3 tracker remains available as a browser-local guest workspace. Optional email/password accounts now save applications, interviews, and notes in local PostgreSQL through the same FATS interface. Account registration/login do not transfer browser records. Settings offers a count preview and explicit confirmation for an additive transfer, retaining original local data and all record identities/relationships. Conflicts stop the transfer; duplicate confirmations do not duplicate records. Settings backups operate on the active account or guest workspace using the existing format.

Account ownership is enforced on the server and in database relationships. Logging out clears the account view and revokes that session. Expiration blocks account saves and offers reauthentication while preserving mounted form inputs. Sidekick still requires final confirmation and can return to the same handoff after login. Maria Santos remains an explicitly labelled guest sample; signed-in greetings use the account name. No default records are created.

Phase 4.1 adds required email verification, resend, forgot-password and reset forms, verified account status, and private operator database recovery. Development messages arrive in a local Mailpit inbox and never reach real recipients. Existing unverified accounts keep their records and verify before accessing them. Resetting a password signs out every session for that account; recovery requests use generic feedback. JSON exports and guest recovery remain available. This is a local foundation with no cloud resources or public deployment. Phase 5 adds private PDF/DOCX document management for verified accounts. AI, payments, email automation beyond account recovery, calendars, notifications, crawling, and cloud deployment remain outside scope. See [Phase 4.1 verification](PHASE_4_1_VERIFICATION.md) and [ADR 0002](decisions/0002-account-safety-and-recovery.md). The sections below retain the earlier guest-mode product decisions; statements about browser-only storage describe that mode.

## Confirmed decisions

FATS (Friendly Applicant Tracking System) is a personal job-search companion designed primarily for fresh graduates in the Philippines. It helps people organize opportunities and their progress. It is not a recruitment ATS or job marketplace: employers do not post jobs, and saving an external job does not submit an application.

**Friendly by default. Powerful when needed.**

**Simple enough for someone's first application. Powerful enough for their fiftieth.**

The current slice supports manually saving a title, company, external source URL, location, and optional description; listing, searching, filtering, viewing and editing those jobs; and choosing Saved, Applied, Assessment, Interview, Offer, Rejected, or Withdrawn. Users can link multiple manual interview records to each job, prepare, reschedule, complete, cancel, and reflect. Dashboard totals, nearest upcoming interview, preparation guidance, and recent applications come from the same persisted workspace.

First-time users see zero applications, gentle three-step guidance, and a clear save action. No default applications or scheduled interviews are fabricated. Interviews guides users to save an application first; Resumes offers a private account library and a sign-in explanation for guests. Settings describes the local workspace; Help explains interview management and storage recovery.

## Phase 2 — manual interview management

- Save a title, stage (HR, Technical, Behavioral, Final, or Custom), date, time, explicit IANA timezone, and meeting URL or physical location. Use the title to describe a Custom stage.
- Choose an existing application; company and role are derived from it. Application details show all associated interviews and a scheduling action.
- Browse Upcoming, Past & completed, Cancelled, or All interviews, with combined application and text filters. A scheduled interview whose time has passed stays scheduled until the user changes its status.
- Edit details or reschedule; mark completed, cancelled, or scheduled again. These actions never change the recruitment status or contact the company.
- Keep expected questions, preparation topics, and reminders in a plain-text preparation field. Record questions asked, what went well, and improvements in a plain-text reflection field. Both are optional and editable on the detail page.
- Show dates in the interview's own timezone everywhere. Reject times skipped by clock changes; ask for first/second occurrence when a time repeats. Editing unrelated fields preserves the saved instant.
- Show the upcoming count and nearest scheduled interview on the dashboard, with a link to preparation. Counts exclude completed, cancelled, and elapsed records. The clock refreshes every 30 seconds while open; other tabs refresh after storage changes.

All records and notes stay in browser local storage; there is no server-side development database, encryption, or account privacy boundary. Users can explicitly download local JSON backups in Settings; browser storage itself is not a durable backup. They are not sent to external services. Users sharing a browser profile share this workspace. Save notes explicitly; navigation or closing an unsaved form can discard its draft. Failed writes retain inputs for retry.

An application with linked interviews cannot be deleted through the repository, even when all interviews are completed or cancelled. This preserves history and prevents orphans. There is no application/interview deletion UI in this slice. Already-corrupt or externally orphaned records block reads/writes with recovery guidance, leaving raw storage untouched.

## Assumptions for this slice

- Maria Santos is a sample profile used for a personalized greeting, clearly labeled in the shell and Settings. Profile editing/authentication are not implemented.
- One browser origin is one workspace; application data persists in that browser only. No durable storage or device sync is promised.
- Source URL and location are required; a location such as “Remote” is valid. Sidekick can combine an explicit work arrangement with location when saving. Job descriptions are plain text; captured HTML is converted to text and never rendered as HTML.
- All status transitions are allowed so users can record an existing process or correct a mistake. No automatic application dates, reminders, or interview records are inferred from a status.
- Recent applications are sorted by most recent update. “In progress” includes Applied, Assessment, and Interview; Saved and terminal statuses are separate.
- There is no demo seed UI. Synthetic job data exists only in tests; the sample name does not imply sample applications.

These are reversible implementation assumptions, not settled policy for a future hosted product.

## Honesty and boundaries

FATS does not crawl links, contact companies, generate AI advice, send invitations/reminders, or apply on the user's behalf in this version. It does not use remote APIs, external credentials, subscriptions, or native apps. Local browser data can be lost if site data is cleared. Calendar integrations and notifications require separate future work.

## Phase 2.1 — data safety and recovery

Settings includes Data management: export a complete JSON backup, choose a file, preview incoming/current counts, and explicitly confirm full replacement. Cancel and Escape leave saved records unchanged. Invalid/unsupported backups and failed writes never replace data. Empty backups require the same acknowledgment and warn that they remove all records. A valid backup can recover unreadable current storage after a clear warning and confirmation.

Backups preserve all application/interview identifiers, timestamps, statuses, notes, and links. They contain private, unencrypted information and stay entirely client-side. They exclude resume documents, unrelated browser storage, and unsaved drafts. This is a manual full restore, with no merge or automatic/cloud backup. See [BACKUPS.md](BACKUPS.md) for the format and recovery instructions.

## Phase 3 — FATS Sidekick

Chrome Sidekick helps users capture one opportunity from an external page, correct the details in a compact side panel, and open FATS for final review. Only **Confirm and save** creates a Saved application through the existing tracker rules. Saving never applies for a job. A repeated handoff or already-saved posting links to its existing record without overwriting details.

Capture is explicit and uses temporary access to the current tab. It prioritizes JobPosting structured data, then basic semantic HTML/metadata. Missing information stays blank; ambiguous multi-job pages require manual entry. Users can always type or paste a description without supported extraction or page access. There is no AI analysis, site-specific adapter, crawler, login bypass, automatic application, or background synchronization.

This unpacked development build supports only the two documented local FATS origins on port 3000. Job fields travel through a checked local message bridge, never URL parameters/history. The extension retains one pending handoff in private session storage for up to 15 minutes of validity; a new handoff replaces it, and extension reload/browser restart clears it. Unsent panel drafts are volatile. Saved records remain in the existing browser workspace and its JSON backups. See [SIDEKICK.md](SIDEKICK.md) for trust boundaries and limitations.

## Phase 5 — private documents and submitted resume versions

Verified accounts can upload and organize resumes, cover letters, certificates, and other application documents. The library supports rename, combined search/category/archive filters, PDF preview, download, immutable numbered versions, an explicit default resume, and archive/restore. New/empty accounts have no documents. Guests are invited to sign in; actual bytes are never stored in localStorage.

An application records one explicitly chosen resume version. New uploads, default changes, renaming, and archive actions leave existing submitted version IDs unchanged. Archived submitted files remain accessible. Referenced documents cannot be deleted or recategorized away from Resumes. Unlinked document deletion removes all versions after confirmation. Recording a file never sends it to an employer.

Limits: nonempty PDF/DOCX up to 10 MiB, 100 MiB/account including history and archives, 50 documents, 20 versions/document. Standard unencrypted PDF 1.0–1.7 and a documented classic ZIP/UTF-8 DOCX subset are supported. Format checks and isolated previews are not malware scanning.

Missing/corrupt files keep their metadata and application history with recovery guidance. JSON exports contain no document metadata/bytes/links; JSON replacement is blocked until submitted links are explicitly removed. Complete local operator archives include matching files and metadata. See [document behavior/storage](DOCUMENTS.md), [recovery](DATABASE_RECOVERY.md), and [verification](PHASE_5_VERIFICATION.md). Stop after Phase 5.
