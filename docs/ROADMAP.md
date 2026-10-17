# Roadmap

## Career Vault MVP — authorized non-AI extension

- Verified-account planned/current/previous employment, application/accepted-offer connections, and explicit prefill without starting employment.
- Per-employer document metadata, request/receipt states, optional dates/year/notes, immutable history and empty first-use guidance.
- Existing owner-authorized accepted-version links only, truthful unavailable files, and local PDF Tools reuse. New-file saving remains unavailable while scanning is paused.
- Migration 0010, transactional/versioned/idempotent writes, account erasure, protected history, version 3 additive JSON with legacy compatibility, and operator recovery.
- See [capabilities and limits](CAREER_VAULT.md) and [verification](CAREER_VAULT_VERIFICATION.md). No AI, payroll/tax computation, official records, notifications, ClamAV installation, paid services or deployment.

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

Private Beta Readiness Part 1 now assesses the existing product and pauses Phase 6 behind a default-off server gate. The next non-AI work is to resolve the prioritized real-data blockers and run the [synthetic moderated study](PRIVATE_BETA_TEST_PLAN.md), not start another product phase. See [readiness, fixes and executed checks](PRIVATE_BETA_READINESS.md). No hosting, paid resources, recruitment, or deployment was performed.

Offer Desk is a retained separately authorized non-AI extension. Offer Desk 1.1 extends the existing JSON backup flow with portable offer history, additive imports, conflict previews, and explicitly unlinked document references. Complete file-and-link recovery still requires operator archives. Further work requires separate scope. Career Vault is now separately authorized only for the bounded organizer above. Its next step is a synthetic graduate walkthrough and retention/recovery rehearsal; further phases and production deployment require separate authorization. All AI development and live evaluation remain paused until explicitly resumed; prior comparison evidence remains in [Phase 6.1 verification](PHASE_6_1_VERIFICATION.md).

## Offer Desk MVP — authorized extension

- Contextual application flow for incomplete offer terms, exact decimal gross amounts, and explicit timezone/calendar deadlines.
- Beginner checklist and HR questions; immutable revised terms, negotiation notes, and confirmed decision history.
- Existing private PDF/DOCX library and exact version references, preserving ownership and historical letters.
- Reviewing-offer deadlines on the dashboard, without notifications or inferred employer withdrawal.
- Owner-scoped PostgreSQL migration, transactional version conflicts, retry protection, JSON replacement guards, and operator recovery compatibility.
- See [design and limits](OFFER_DESK.md) and [executed verification](OFFER_DESK_VERIFICATION.md). No AI, new top-level product, Career Vault, or deployment.

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

Potential directions: evaluated matching quality and retention controls; managed document cleanup and hosted readiness; application notes/history; useful reminders. Prioritize with users before building these.

No crawler, native app, subscription system, or deployment is included. Hosted origins and extension-store publication require separate authorization. Phase 6 remains a preserved historical implementation, server-disabled for beta; AI work requires explicit authorization to resume. Stop after Phase 6.

## Phase 5 — resume and document management

- Private verified-account PDF/DOCX library backed by PostgreSQL metadata and a persistent filesystem storage interface, ready for a separately implemented S3-compatible adapter.
- Owner-scoped access, format/size/quota checks, private downloads, isolated PDF preview, and corruption/missing-file guidance.
- Immutable numbered versions, explicit default resume, rename/category/search/archive controls, and safely restricted deletion.
- Explicit application-to-version association that never follows a new upload automatically, plus a small contextual dashboard step.
- Consistent PostgreSQL/file archives and explicitly targeted recovery, JSON omission/replacement guards, and read-only integrity audit.
- Actual filesystem, PostgreSQL, browser, extension, and production verification: [Phase 5 evidence](PHASE_5_VERIFICATION.md).

## Phase 6 — explainable resume-to-job matching

- Local bounded PDF/DOCX extraction, source review, and explicit external-transmission consent on an application and exact resume version.
- Server-side provider interface, pinned OpenAI adapter, strict structured output, fixed safe errors/timeouts, and persistent account/global usage limits.
- Exact validated source citations, conservative classification checks, supported requirement priorities, cautious suggestions, and no scores or invented qualifications.
- Owner-scoped versioned reports, stale job-revision detection, explicit reruns/deletion, and protected parent/JSON-replacement semantics.
- Recovery of completed reports with paired private bytes; deterministic fixture tests only, with no live-model quality or cost claim.
- See [design and limitations](MATCHING.md) and [executed Phase 6 evidence](PHASE_6_VERIFICATION.md). Stop after Phase 6.
