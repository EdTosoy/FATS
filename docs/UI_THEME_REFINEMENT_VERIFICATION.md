# UI theme refinement verification

Date: 2026-10-18. Starting checkpoint: `a908b43` (`feat(dashboard): add job
search momentum tracker`). Git status was clean before editing. No commit, push,
deployment, dependency installation, database migration, or extension redesign was
performed for this milestone.

## Original problems and references

Inspected the root/web AGENTS instructions, App Router/provider boundaries, shared
UI components, global CSS, account/guest persistence, PDF rendering/export, existing
browser fixtures, all four `uiux/*.png` references, and the supplied Shotback PNG
and JSON at `cap-1792183831738`.

The earlier capture reported a dark browser preference while showing a light app.
There was no global preference/provider or dark palette: most backgrounds, buttons,
forms, badges, and dialogs used fixed light colors. The later Momentum checkpoint
had an isolated media-query palette. This was missing application-wide theme
support, not an incorrect browser setting. The account-access banner in the capture
was a separate availability state.

The welcome card used substantial decorative artwork and repeated encouragement
across its greeting, next-step card, empty table, onboarding steps, and footer tip.
Its empty-only behavior offered returning users no comparable contextual welcome.

## Welcome Card V2

- Removed the cityscape, sun, clouds, plant, floating note, and their CSS, including
  responsive decoration. No replacement artwork, gradients, remote fonts, or new
  UI framework.
- A compact editorial panel presents an eyebrow, balanced heading, short supporting
  text, and one primary action. It becomes a vertical layout below 1100px.
- An empty workspace prioritizes **Save your first job** and explains that saving
  does not apply for the job. Returning workspaces use the existing nearest
  interview, saved application, or application overview as their contextual action.
  Statistics and scheduling calculations are unchanged.
- Removed the duplicate next-step panel, greeting decoration, first-steps strip,
  and generic tip. The empty recent-applications panel is a short factual message.
- Browser checks bound welcome height below 300px at all tested viewports; desktop
  proportions are substantially shorter than the former illustrated card.

## Momentum colors

Only presentation changed. The streak and flame use restrained amber, completed
days use the shared mint success surface/check, inactive days use a neutral surface
and dot, and today has an understated blue outline. All colors come from semantic
theme tokens. Seven-day labels, checkmarks, `aria-current`, calendar rules, stored
history, deduplication, and streak logic remain unchanged. The sidebar retains
235px/210px widths; its full contents fit the original 1916 × 952 viewport.

## Global theme architecture and preference behavior

- `apps/web/src/app/theme.css` owns the complete light and dark palettes. Existing
  CSS consumes semantic surface, text, action, input, border, success, information,
  warning, danger, neutral, overlay, shadow, PDF-stage, and paper roles. Tailwind
  color aliases resolve to these same tokens. There are no component-specific dark
  media queries or hardcoded application colors in `globals.css`.
- The root Server Component emits a small, constant first-party script in `head`.
  It validates the saved preference, resolves System through `matchMedia`, and sets
  `data-theme` and `data-theme-preference` before the body is parsed. No user data,
  credentials, network calls, or account lookup enter this script.
- The client `ThemeProvider` lives above account/workspace providers, so account
  changes and navigation cannot reset it. `useSyncExternalStore` supplies a stable
  server snapshot; hydration suppression is restricted to the root HTML attributes
  intentionally updated by the bootstrap. No hydration warnings were observed.
- `Light`, `Dark`, and `System` are supported. Missing, invalid, or unreadable
  storage defaults to System. The local key is `fats.appearance.v1`, separate from
  workspace data and backups, with no database schema expansion.
- System changes are observed live. Explicit preferences override System. Storage
  events synchronize tabs, including removal of the preference. Guest and account
  workspaces share the browser's appearance preference.
- Settings has a native radio group; the header appearance icon links directly to
  it. Authentication headers offer a labelled native select. Blocked writes still
  change this visit's appearance and show a truthful persistence error; a reload
  returns to the previous saved preference/System.
- Nx quality inputs include `apps/web/src/app/**/*.css`, so palette unit checks
  are invalidated when their tested stylesheets change.
- `color-scheme` follows the resolved theme for native selects, date/time controls,
  checkboxes, and other browser-rendered UI. PDF paper/signature surfaces explicitly
  remain light. Reduced-motion preference removes CSS transitions/animations.

Framework behavior was checked against the installed Next.js 16.4.0 documentation
for client boundaries and scripts, then verified in a real production build and
browser, including observation of the theme when the body first appears.

## Coverage and visual inspection

Production browser contexts used only synthetic guest workspaces and dedicated
local test accounts. AI configuration was disabled. Private accepted-document
fixtures use the existing test-only synthetic scanner and dedicated test storage;
the application upload scanner/quarantine paths were not changed or bypassed in
application configuration. ClamAV was not installed. Synthetic account cleanup uses
the existing account-erasure lifecycle.

| Surface              | Rendered/audited states                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard/onboarding | Guest empty, fresh verified account, saved job, populated statuses, upcoming interview, contextual welcome, statistics, Momentum                       |
| Applications         | List/search/filter, all seven status labels, application detail, job dialog, empty/error storage states                                                |
| Interviews           | List, detail/preparation notes, schedule dialog, native date/time controls, empty state                                                                |
| Resumes/documents    | Guest explanation, populated private library, filters, upload dialog, version/detail dialog, nested PDF preview, unavailable historical links          |
| PDF Tools            | Local file picker, populated editor, text marks, exported file, surrounding controls, original white paper                                             |
| Offer Desk           | Terms, review summary, decision state, review checklist/questions dialog, disabled actions                                                             |
| Career Vault         | Guest explanation, populated employment/document records, edit-employment dialog, scanner-unavailable guidance                                         |
| Settings/recovery    | Appearance, account/guest storage cards, migration explanation, backup preview/import confirmation, warnings and counts                                |
| Account security     | Delete-account confirmation (never submitted by the visual journey), disabled destructive action, expired-session gate                                 |
| Authentication       | Configured login, registration, email verification and verified state, password recovery, missing-reset-link state; also unconfigured-account guidance |
| Help/Sidekick web    | Guidance, truthful empty/error capture states, manual-entry controls; extension bridge protections unchanged                                           |

Viewports: **1916 × 952**, **1366 × 768**, **820 × 1180**, and **390 × 844** CSS
pixels. Existing regression journeys also use their configured desktop/iPhone-sized
viewports. Screenshots are full-page captures unless scoped by the existing test;
their image height can exceed the viewport. Chromium's sandbox remained enabled.

Actual images were inspected for hierarchy, proportions, readable copy, field
boundaries, dark surface separation, badges, focus rings, and paper preservation.
Representative inspected frames include both desktop welcome themes, mobile dark
welcome/authentication, populated laptop dashboard, tablet document library,
Career Vault form, nested PDF preview, and mobile offer/interview/backup overlays.
The visual pass identified weak Career Vault/PDF input borders; these were changed
to the shared control-border role. A final authentication screenshot caught button
background interpolation across themes; button colors now switch immediately so
foreground/background contrast does not cross a transient gray state. Long dialogs
remain vertically scrollable.

Final local review artifacts are retained in the ignored
`test-results/ui-theme-evidence/` directory, with guest, account, and authentication
subdirectories, plus Momentum presentation frames. No images were uploaded or published. The four original moodboard
SHA-256 hashes are unchanged.

## Accessibility findings

The palette checks target the W3C requirements for [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [essential non-text controls](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html):
the tested text/action/status pairs exceed 4.5:1, and the tested input borders
exceed 3:1. Minimum measured representative ratios are 4.94:1 text / 3.15:1 controls
in light, and 6.55:1 text / 3.68:1 controls in dark. These are palette measurements,
not a claim that every rendered pixel or every WCAG criterion has been audited.

Native radio checks, status text, Momentum checks/dots/date labels, and selected-day
outlines preserve meaning without relying only on hue. Explicit labels remain on
forms. Keyboard-visible focus follows the shared focus role, including radio-group
containers and the skip link. The approach follows the [visible keyboard focus
requirement](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html). Job-dialog
focus trapping/cancellation and focus return are covered by existing/new browser
journeys; account-dialog focus containment passed in the final audit.
Disabled controls remain identifiable and cannot be submitted. No new animation,
notification, score, or competitive UI was added.

PDF previews and signature pads retain white paper and dark ink, with no filters,
inversion, or changes to the PDF engine/painter. Browser tests compare base canvas
pixels, mark pixels, and SHA-256 of exported bytes across light/dark; all match.

## Executed verification

Environment: Node 24.21.0, pnpm 11.27.0, Next.js 16.4.0, installed repository
Playwright/Chromium, dedicated local PostgreSQL/Mailpit. Port 3000 and its existing
development server were left running. Production browser tests used ports 3101
and 3102; no shared dev lock or bridge allowlist was changed.

| Result                           | Command/check                                                                                                                                                                                                                     | Outcome                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS                             | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck`                                                                                                                                                                         | All four workspace targets                                                                                                                              |
| PASS                             | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`                                                                                                                                                                              | All four targets after removing one unused test variable                                                                                                |
| PASS                             | `pnpm format:check`; `git diff --check`                                                                                                                                                                                           | Formatting/whitespace                                                                                                                                   |
| PASS                             | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build`                                                                                                                                                                             | Default Turbopack optimized production build, TypeScript and route generation                                                                           |
| PASS                             | `pnpm exec vitest run tests/unit/theme.test.ts`                                                                                                                                                                                   | 13 preference, bootstrap, palette contrast, paper-preservation, and token-centralization tests                                                          |
| PASS                             | `pnpm exec vitest run --no-file-parallelism tests/unit/theme.test.ts tests/unit/matching.test.ts tests/unit/upload-security.test.ts tests/unit/pdf-tools.test.ts tests/unit/pdf-tools-worker.test.ts tests/unit/momentum.test.ts` | 46 tests; parser capacity failures cleared without competing parser workers                                                                             |
| PASS                             | `FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3101 pnpm exec playwright test tests/e2e/theme.spec.ts --workers=1`                                                                                                                        | 10 desktop/mobile theme, pre-hydration, persistence, route/dialog, and PDF output journeys; final repeat uses `--output=test-results/theme-final-guest` |
| PASS                             | `FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3102 pnpm test:e2e:account tests/account-e2e/theme.spec.ts`                                                                                                                                | Four populated-account/authentication journeys, including final dialog-focus containment                                                                |
| FAIL, baseline/environment cases | `FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3101 pnpm exec playwright test --workers=1`                                                                                                                                                | 58 passed / 8 failed. All new theme journeys, application/interview/Momentum/PDF journeys passed. Failures detailed below                               |
| FAIL, baseline/resource cases    | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test`                                                                                                                                                                              | 258 passed / 3 failed. All 13 new theme tests passed. Failures detailed below                                                                           |

After removing button color interpolation, the final production build passed and
`FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3102 pnpm test:e2e:account tests/account-e2e/theme.spec.ts -g authentication`
passed both desktop/mobile journeys. The refreshed dark registration screenshot
shows the correct solid secondary surface immediately after switching themes.

The build retains two existing dynamic-filesystem tracing warnings at unchanged
`document-scanner.ts:40–41`, previously recorded in the repository's verification
notes. Packaging/deployment was not expanded or silently repaired.

### Existing failures and environmental limits

1. **Frozen AI comparison plan:** `matching-comparison-plan.test.ts` expects
   `23dd7d8a…` for `resume-extraction.ts`, but both the committed HEAD and untouched
   working file hash to `f6792e87…`. This known checkpoint mismatch was left intact;
   no AI configuration, frozen plan, or extraction code was changed.
2. **Parallel parser capacity:** `matching.test.ts` returned `limit` for a blank
   fixture and `upload-security.test.ts` received the existing busy response under
   the full parallel run. Both pass in the recorded serial focused run. Parser
   limits/isolation were not weakened.
3. **Six backup assertions:** three unchanged `backups.spec.ts` cases fail on each
   viewport because expected storage envelopes omit the committed Momentum
   `activityDays` field. The diffs contain that extra field only. SHA-256 comparison
   confirms the backup assertions, local adapter, and backup domain source exactly
   match starting HEAD. These are baseline expectation mismatches, not theme data
   writes. Neither data semantics nor the unrelated assertions were changed.
4. **Two Sidekick handoff expectations:** the installed bridge accepts only its
   existing port-3000 origins. At isolated port 3101 it rejects the handoff early
   with “Open FATS from Sidekick…” rather than the missing-extension text expected
   by the unchanged test. Forged/missing-handoff protection tests pass. The full
   accepted-origin extension journey was not rerun against the user's live server.

## Remaining limitations and separate extension work

- The MV3 extension imports its own `panel.css`, runs under a separate extension
  origin, and does not consume the web theme provider or browser preference key.
  It remains unchanged. A future explicit extension-theme task should define its
  own persistence/system behavior and port the semantic palette consistently;
  this milestone does not claim extension dark-mode support.
- Firefox/WebKit, native iOS, assistive-technology sessions, high-contrast/forced
  colors, and a complete WCAG conformance audit were not run. Mobile evidence is
  sandboxed Chromium emulation. Palette checks plus keyboard/visual inspection
  provide scoped accessibility evidence, not certification.
- No JavaScript-disabled interactive workspace is claimed; the existing web app
  already depends on client providers. An unreadable preference follows System;
  a blocked write is session-only and truthfully reported.
- No database migration, application/offer calculation, Momentum rule, private-file
  authorization/quarantine rule, PDF export implementation, or AI feature changed.
  Generated Next type-path churn is returned to its starting content before handoff.
