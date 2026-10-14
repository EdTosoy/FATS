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

## Recommended next implementation step

Consider a narrowly scoped unsaved-draft warning for application/interview forms and notes. Confirm the behavior and browser navigation trade-offs before implementing it. It would protect work that has not yet reached storage and therefore is not included in backups. No next slice is started here.

## Later work — requires a separate scope

Potential directions: resume/document library; application notes/history; identity and durable NestJS/PostgreSQL storage; device sync; opt-in browser capture extension; useful reminders; user-controlled AI assistance. Prioritize with users before building these.

No backend, AI provider, crawler, extension, native app, subscription system, or deployment is part of Phase 2. The order and requirements of later work are assumptions to validate, not approved implementation commitments. Stop after Phase 2; no Phase 3 work is authorized.
