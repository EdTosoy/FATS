# Roadmap

## Phase 0 — foundation

- Nx/pnpm workspace, Next.js App Router, TypeScript, Tailwind, reusable native/Radix components.
- Linting, formatting, type checking, unit and browser tests.
- Product, architecture, design-system, and repository instructions.
- Preserve the three visual references.

## Phase 1 — current narrow slice

- Responsive navigation and page shell.
- Friendly first-use guidance with no fake job data.
- Manual save, list, search, status filter, detail view, detail edit, and all seven statuses.
- Local persistence through a repository interface.
- Dashboard guidance, statistics, and recent jobs derived from application state.
- Honest Resume/Interview shells, Settings explanation, and Help.

Executed evidence and any verification gaps are recorded in [VERIFICATION.md](VERIFICATION.md).

## Recommended next implementation step

Add manual interview records linked to applications: date/time with an explicit timezone, location or meeting link, and preparation notes. Extend the domain/repository contract first, then make Upcoming interviews display actual scheduled records. Continue using local persistence and test the full create → dashboard → reload path before choosing a backend.

## Later work — requires a separate scope

Potential directions: resume/document library; application notes/history; identity and durable NestJS/PostgreSQL storage; device sync; opt-in browser capture extension; useful reminders; user-controlled AI assistance. Prioritize with users before building these.

No Phase 2 backend, AI provider, crawler, extension, native app, subscription system, or deployment is part of this implementation. The order and requirements of later work are assumptions to validate, not approved implementation commitments.
