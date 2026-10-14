# Product

## Confirmed decisions

FATS (Friendly Applicant Tracking System) is a personal job-search companion designed primarily for fresh graduates in the Philippines. It helps people organize opportunities and their progress. It is not a recruitment ATS or job marketplace: employers do not post jobs, and saving an external job does not submit an application.

**Friendly by default. Powerful when needed.**

**Simple enough for someone's first application. Powerful enough for their fiftieth.**

The current slice supports manually saving a title, company, external source URL, location, and optional description; listing, searching, filtering, viewing and editing those jobs; and choosing Saved, Applied, Assessment, Interview, Offer, Rejected, or Withdrawn. Dashboard totals and recent applications come from the same persisted state.

First-time users see zero applications, gentle three-step guidance, and a clear save action. No default applications or scheduled interviews are fabricated. Resume and interview pages are navigable and explain their current limits. Settings describes the local workspace; Help explains the workflow and storage recovery.

## Assumptions for this slice

- Maria Santos is a sample profile used for a personalized greeting, clearly labeled in the shell and Settings. Profile editing/authentication are not implemented.
- One browser origin is one workspace; application data persists in that browser only. No durable storage or device sync is promised.
- Source URL and location are required; a location such as “Remote” is valid. Job descriptions are plain text, not imported or rendered as HTML.
- All status transitions are allowed so users can record an existing process or correct a mistake. No automatic application dates, reminders, or interview records are inferred from a status.
- Recent applications are sorted by most recent update. “In progress” includes Applied, Assessment, and Interview; Saved and terminal statuses are separate.
- There is no demo seed UI. Synthetic job data exists only in tests; the sample name does not imply sample applications.

These are reversible implementation assumptions, not settled policy for a future hosted product.

## Honesty and boundaries

FATS does not crawl links, contact companies, generate AI advice, upload files, schedule interviews, or apply on the user's behalf in this version. It does not use remote APIs, external credentials, subscriptions, or native apps. Local browser data can be lost if site data is cleared. Resume/library and scheduling features require separate future work.
