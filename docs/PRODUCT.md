# Product

## Confirmed decisions

FATS (Friendly Applicant Tracking System) is a personal job-search companion designed primarily for fresh graduates in the Philippines. It helps people organize opportunities and their progress. It is not a recruitment ATS or job marketplace: employers do not post jobs, and saving an external job does not submit an application.

**Friendly by default. Powerful when needed.**

**Simple enough for someone's first application. Powerful enough for their fiftieth.**

The current slice supports manually saving a title, company, external source URL, location, and optional description; listing, searching, filtering, viewing and editing those jobs; and choosing Saved, Applied, Assessment, Interview, Offer, Rejected, or Withdrawn. Users can link multiple manual interview records to each job, prepare, reschedule, complete, cancel, and reflect. Dashboard totals, nearest upcoming interview, preparation guidance, and recent applications come from the same persisted workspace.

First-time users see zero applications, gentle three-step guidance, and a clear save action. No default applications or scheduled interviews are fabricated. Interviews guides users to save an application first; Resumes explains its current limits. Settings describes the local workspace; Help explains interview management and storage recovery.

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
- Source URL and location are required; a location such as “Remote” is valid. Job descriptions are plain text, not imported or rendered as HTML.
- All status transitions are allowed so users can record an existing process or correct a mistake. No automatic application dates, reminders, or interview records are inferred from a status.
- Recent applications are sorted by most recent update. “In progress” includes Applied, Assessment, and Interview; Saved and terminal statuses are separate.
- There is no demo seed UI. Synthetic job data exists only in tests; the sample name does not imply sample applications.

These are reversible implementation assumptions, not settled policy for a future hosted product.

## Honesty and boundaries

FATS does not crawl links, contact companies, generate AI advice, upload files, send invitations/reminders, or apply on the user's behalf in this version. It does not use remote APIs, external credentials, subscriptions, or native apps. Local browser data can be lost if site data is cleared. Resume/library, calendar integrations, and notifications require separate future work.

## Phase 2.1 — data safety and recovery

Settings includes Data management: export a complete JSON backup, choose a file, preview incoming/current counts, and explicitly confirm full replacement. Cancel and Escape leave saved records unchanged. Invalid/unsupported backups and failed writes never replace data. Empty backups require the same acknowledgment and warn that they remove all records. A valid backup can recover unreadable current storage after a clear warning and confirmation.

Backups preserve all application/interview identifiers, timestamps, statuses, notes, and links. They contain private, unencrypted information and stay entirely client-side. They exclude resume documents, unrelated browser storage, and unsaved drafts. This is a manual full restore, with no merge or automatic/cloud backup. See [BACKUPS.md](BACKUPS.md) for the format and recovery instructions.
