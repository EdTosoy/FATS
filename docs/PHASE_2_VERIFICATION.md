# Phase 2 — manual interview management

This historical report predates data safety and recovery. See [Phase 2.1 verification](PHASE_2_1_VERIFICATION.md) for the current slice and resolved repository-wide formatting baseline.

Verified locally on 2026-10-15 with Node 24.21.0 and pnpm 11.27.0. This work completes the interview draft already present in the working tree. Existing brand assets and the additional brand identity board were preserved. No dependencies were added, no commits or pushes were made, and nothing was published or deployed.

## Behavior and decisions

The domain owns the interview model, validation, creation/update rules, timezone conversion, grouping, and upcoming selection. Interviews reference applications by ID; company/role are derived. The repository supports multiple linked records, retrieval by application, upcoming retrieval, editing, rescheduling, completion, cancellation, and notes. Recruitment statuses remain independent.

The Interviews route provides upcoming, past/completed, cancelled, and all views with combined text/application filters. Details include meeting/location, preparation, reflections, status actions, and the related application. Application details list interviews and offer scheduling. The dashboard uses the same persisted collection for its count, nearest conversation, and preparation link. Empty workspaces remain empty.

Storage stays in `fats.applications.v1`: `{ version: 1, applications: [...], interviews: [...] }`. Missing `interviews` in Phase 1 data means an empty collection; reading never rewrites it. Writes preserve both collections together. Invalid records, duplicate IDs, unsafe URLs, or missing parents block reads/writes and leave the original value untouched. Failed writes retain form inputs and the previous saved data. Application deletion is restricted while any interview references it, including completed/cancelled records; no deletion UI is added.

Scheduling stores a UTC instant plus an explicit IANA timezone. Invalid calendar dates and skipped wall times are rejected. Repeated times require first/second occurrence; changing appointment fields clears that choice. Unchanged edits preserve the original instant. Tests include Manila midnight/UTC date boundaries, leap days, half/quarter-hour offsets, daylight-saving gaps/folds, half-hour transitions, second-based historical offsets, and a skipped date across the date line.

## Verification results

Nx commands use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. Cache bypass is explicit where noted. Playwright requires scoped permission to bind the local server and launch system Chromium; its sandbox remains enabled. Initial restricted browser startup failed with `listen EPERM` and was rerun with that permission.

| Command / check                                                                          | Result | Evidence                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck --skip-nx-cache`                                                         | PASS   | All three projects; final run 8.9 seconds.                                                                                                                                                               |
| `pnpm lint --skip-nx-cache`                                                              | PASS   | All three projects with zero warnings; final run 5.5 seconds.                                                                                                                                            |
| `pnpm test --skip-nx-cache`                                                              | PASS   | Repository-native Nx/Vitest target executed without cache.                                                                                                                                               |
| `pnpm exec vitest run`                                                                   | PASS   | Four files, 74 tests; final run 258 ms.                                                                                                                                                                  |
| `pnpm test:e2e`                                                                          | PASS   | 26 tests: 14 Phase 1 and 12 Phase 2, desktop/mobile; 1.5 minutes. No unexpected runtime errors in monitored journeys.                                                                                    |
| `pnpm build --skip-nx-cache`                                                             | PASS   | Optimized Next.js build, TypeScript, static pages, and dynamic detail routes; 12.7 seconds.                                                                                                              |
| `pnpm start` + Node `fetch` probes                                                       | PASS   | Production server; all eight checked routes returned HTTP 200 with FATS content, including both detail-route shells.                                                                                     |
| `pnpm exec playwright test tests/e2e/interviews.spec.ts --grep 'validates timezone'`     | PASS   | Two desktop/mobile scenarios against the production server after the final wording correction; 7.5 seconds.                                                                                              |
| `pnpm format:check`                                                                      | FAIL   | Only the pre-existing, untouched `brand-assets/README.md` is reported. It was already untracked at inspection; Phase 2 formatting commands did not write to it. No unrelated formatting repair was made. |
| `pnpm exec prettier --check AGENTS.md README.md apps/web/src libs/domain/src tests docs` | PASS   | All Phase 2 source, tests, and documentation match Prettier.                                                                                                                                             |
| `git diff --check`                                                                       | PASS   | No whitespace errors in tracked changes.                                                                                                                                                                 |
| SHA-256 comparison against `git show HEAD:uiux/<original>.png`                           | PASS   | All three original moodboards match.                                                                                                                                                                     |

The initial browser attempts exposed helper text being included in accessible field names and exact-label selectors including dropdown option text. Fields now have explicit accessible names with described hints, and filter tests use accessible combobox roles/names. After those corrections, the complete suite passed. A final copy correction removes the incorrect direction “below” from the repeated-time error; it changes no scheduling behavior. Unit tests and the production build were rerun afterwards.

The development server was started by Playwright using the configured repository command. `pnpm start` was checked separately after the production build, including the two real browser validation/keyboard scenarios. Temporary servers were stopped afterwards. These checks only touched local test origins and isolated synthetic browser workspaces. `pnpm install` was unnecessary: dependencies were already installed, and package manifests/lockfile did not change.

## Acceptance coverage

- Domain/storage unit tests exercise creation, every interview status, edits, rescheduling, notes, timestamps/identity, multiple interviews, parent association/reassociation, upcoming boundaries, malformed data, duplicate IDs, failed writes/reads, and restricted deletion. Legacy Phase 1 data loads unchanged and survives interview writes.
- Browser lifecycle exercises actual form → provider → repository → local storage → reload → UI, with multiple linked interviews, independent recruitment status, meeting links/physical locations, detail edits, notes/reflections, completion/cancellation, filters, and dashboard synchronization.
- A second tab observes the nearest upcoming interview/count change after completion in the first tab. This proves sequential synchronization, not transactional concurrent writes.
- Browser failures cover create/edit/notes persistence errors, retained drafts, malformed/orphaned records, and missing interview routes. Modal keyboard checks cover focus containment, Escape cancellation, and restoring focus. Invalid timezone/meeting URL and DST gap/fold messages are exercised in the real form.
- Existing Phase 1 browser journeys remain in the full suite: zero-state dashboard, save/edit/reload, all seven statuses, search/filter, navigation, keyboard behavior, write failures, and corrupt storage.
- Desktop 1440 × 1100 and mobile 390 × 664 Chromium viewports use isolated contexts and synthetic records. Screenshots are local ignored artifacts under `test-results/`; no personal notes or user browser workspaces are seeded or uploaded.
- Interview workspace, detail, dashboard, and scrollable-dialog screenshots were inspected on desktop/mobile. Layouts retained the existing white surfaces, muted blue/mint, visible focus, and stacked mobile fields without workspace horizontal overflow. Playwright regenerates `test-results/` on each run, so subsequent scoped checks replace earlier screenshots.

## Files in the Phase 2 change

New files (some were already untracked at task start):

```text
libs/domain/src/interview.ts
apps/web/src/app/interviews/[id]/page.tsx
apps/web/src/components/interview-list.tsx
apps/web/src/components/interview-form-dialog.tsx
apps/web/src/components/interview-detail.tsx
tests/unit/interview.test.ts
tests/unit/interview-repository.test.ts
tests/e2e/interviews.spec.ts
docs/PHASE_2_VERIFICATION.md
```

Modified files (including the pre-existing interview draft):

```text
libs/domain/src/index.ts
apps/web/src/lib/local-application-repository.ts
apps/web/src/components/application-provider.tsx
apps/web/src/components/application-detail.tsx
apps/web/src/components/dashboard.tsx
apps/web/src/components/app-shell.tsx
apps/web/src/app/interviews/page.tsx
apps/web/src/app/globals.css
apps/web/src/app/help/page.tsx
apps/web/src/app/settings/page.tsx
tests/e2e/applications.spec.ts
AGENTS.md
README.md
docs/PRODUCT.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
docs/VERIFICATION.md
```

The three original moodboards were compared byte-for-byte by SHA-256 against Git HEAD and are unchanged. Unrelated `brand-assets/` files and `uiux/FATS SaaS Brand Identity Board.png` are outside Phase 2 and were left untouched.

## Limits and remaining UX work

- Browser-only storage has no authentication, encryption, durable backup, or device sync. The same browser profile shares these notes. Site-data deletion loses records. Simultaneous cross-tab writes can still overwrite each other.
- Upcoming displays refresh their clock every 30 seconds; this is not a notification/reminder service. Past scheduled records require a manual status update. Future timezone-rule changes follow the browser's ICU/IANA data and may affect display of a stored fixed instant.
- Notes require explicit saving. Closing/navigating away from a draft has no unsaved-change warning. Custom stage names use the interview title. Timezones use a text input with suggestions rather than a full searchable picker. Completed/cancelled interviews must be marked scheduled explicitly when plans resume.
- No Firefox/WebKit/native Safari, assistive-technology session, or full accessibility audit was run. Mobile Chromium emulates viewport/touch behavior; it is not native iOS verification. No account/backend/calendar/notification behavior exists to verify.
- Recommended next slice: agree a small local export/import and recovery feature to protect browser-only records. It is a recommendation only; no Phase 3 implementation was started.
