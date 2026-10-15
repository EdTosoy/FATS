# Roadmap

## Phase 0 — foundation

- Nx/pnpm workspace, Next.js App Router, TypeScript, Tailwind, reusable native/Radix components.
- Linting, formatting, type checking, unit and browser tests.
- Product, architecture, design-system, and repository instructions.
- Preserve the three visual references.

## Phase 1 — application tracking

- Responsive navigation and page shell.
- Friendly first-use guidance with no fake job data.
- Manual save, list, search, status filter, detail view, detail edit, and all seven statuses.
- Local persistence through a repository interface.
- Dashboard guidance, statistics, and recent jobs derived from application state.
- Honest Resume shell, Settings explanation, and Help; the former Interview shell is replaced in Phase 2.

## Phase 2 — manual interview management

- UI-independent interview model, validation, timezone conversion, grouping, and upcoming selectors.
- Multiple interviews linked to an existing application, with derived company/role information.
- Create/edit/reschedule, completed/cancelled/scheduled statuses, preparation notes and reflections.
- Interview workspace with search, application/group filters, details, and responsive accessible forms.
- Application detail integration and dashboard upcoming count, nearest conversation, and preparation action.
- Backward-compatible local storage, reference validation, write-failure recovery, and restricted parent deletion.
- Domain/storage tests and real desktop/mobile browser journeys, including DST transitions and reload persistence.

Actual Phase 2 results and limitations are recorded in [PHASE_2_VERIFICATION.md](PHASE_2_VERIFICATION.md).

Executed evidence and any verification gaps are recorded in [VERIFICATION.md](VERIFICATION.md).

## Phase 2.1 — data safety and recovery

- Versioned client-side JSON backups for applications, interviews, notes, and relationships.
- Validated preview and explicitly confirmed full replacement, with cancellation and atomic persistence.
- Legacy storage compatibility, malformed-data handling, stale-preview checks, and recovery over corrupt storage.
- Repository-wide formatting baseline repaired without changing brand README meaning.
- Domain/storage and real desktop/mobile round-trip/failure tests.

Executed results are recorded in [PHASE_2_1_VERIFICATION.md](PHASE_2_1_VERIFICATION.md).

## Phase 3 — FATS Sidekick

- Independently buildable Chrome MV3 extension with a compact React side panel.
- Explicit temporary page capture: JobPosting JSON-LD, basic semantic HTML/metadata, and manual paste/edit fallback.
- Reviewed, short-lived local message handoff to the exact permitted FATS origin; no captured fields in URLs.
- Editable web confirmation using existing creation rules and repository, with duplicate submission/posting protection.
- Minimal permissions, sender/origin/path checks, plain-text rendering, safe stale/reload/failure states.
- Controlled-fixture extraction, actual Chromium extension integration, and Phase 1/2/2.1 desktop/mobile regression coverage.

See [SIDEKICK.md](SIDEKICK.md) for commands and [PHASE_3_VERIFICATION.md](PHASE_3_VERIFICATION.md) for actual evidence and limits. This is an unpacked local development build, not a published Chrome Web Store release.

## Recommended next implementation step

Phase 4.1 is the stopping point for this task. Before inviting external users, separately scope hosted email delivery, deployment-specific proxy/rate-limit policy, and hosted recovery drills. Resume uploads require a separate design and authorization after that foundation is ready. Unsaved-draft warnings and a manual Chrome native-dock usability check remain useful follow-ups.

## Phase 4 — authentication and durable persistence

- Same-origin Next.js Node API with Better Auth email/password authentication and database sessions; no separate NestJS runtime.
- Local PostgreSQL 17, versioned transactional/checksummed migrations, and dedicated disposable integration databases.
- Server-derived ownership, composite application/interview foreign keys, and transactional related writes.
- Explicit additive browser-data transfer, preview/confirmation, conflict checks, durable retry protection, and retained originals.
- Account backup export/confirmed replacement with the existing version 1 JSON format; guest recovery stays available.
- Authentication/loading/expiry/recovery states and Sidekick login return without extension credential access.
- PostgreSQL, desktop/mobile account journeys, guest regressions, and actual extension verification; see [Phase 4 results](PHASE_4_VERIFICATION.md).

## Phase 4.1 — account safety and recovery

- Required, expiring, single-use email verification through Better Auth's OTP plugin; resend rotation, attempt limits, and existing-account verification gates.
- Password recovery with single-use tokens, generic feedback, and transactional session invalidation.
- Local Mailpit inboxes for development and isolated browser tests; no paid provider or hosted configuration.
- Private PostgreSQL archives with checksum/schema validation, explicit target/confirmation, and an actual disposable restore drill.
- Accessible recovery screens, account security review, actual PostgreSQL/mail/browser tests, and existing workspace/Sidekick regressions.
- See [Phase 4.1 results](PHASE_4_1_VERIFICATION.md), [ADR 0002](decisions/0002-account-safety-and-recovery.md), and the [database recovery runbook](DATABASE_RECOVERY.md).

## Later work — requires a separate scope

Potential directions: resume/document library; application notes/history; useful reminders; user-controlled AI assistance. Prioritize with users before building these.

No AI provider, crawler, native app, subscription system, resume upload, or deployment is part of Phase 4.1. Hosted origins and extension-store publication require separate authorization. Stop after Phase 4.1.
