# PDF Tools 2.0 — Phase 3 document editing

21 October 2026. Development candidate: `/dev/pdf-tools-v2`.
Production entry: `/resumes/pdf-tools`.

## Decision

**Phase 3 engineering verification passed. Ready for Phase 4 engineering
planning; keep V2 development-only.** Representative employment documents can be
completed and downloaded with independently verified output. No remaining PDF
engineering blocker was observed in the tested fixtures. The documented glyph,
form and artwork limits remain product constraints. Phase 4 needs its own agreed
scope; no Phase 4 implementation or production rollout is authorized here.
Physical-device and spoken screen-reader validation remain release requirements.

## Architecture and preservation

Quick Sign and Edit PDF share the existing `PdfEdits` and `PdfHistory`. Form
changes remain in `fields`; added text, dates, initials, checks and signatures
remain in `elements`. Switching modes commits the current input transaction and
cancels pending placement without losing completed edits. There is no second
form store, PDF engine, document intake endpoint, persistent signature storage,
Career Vault integration, AI request or external document service.

Implementation entry points are
[workspace](../apps/web/src/components/pdf-tools-v2/workspace.tsx),
[shared history controller](../apps/web/src/lib/use-pdf-tools-quick-sign.ts),
[text/layout helpers](../apps/web/src/lib/pdf-tools-editing.ts),
[derived form preview](../apps/web/src/lib/use-pdf-tools-form-preview.ts), and
[existing PDF engine](../apps/web/src/lib/pdf-tools-engine.ts). Geometry remains
in visible-page points, with the existing PDF.js inverse and crop/rotation
transform; zoom changes do not change stored placement coordinates.

The existing processing worker and pdf-lib inspect and serialize bytes. PDF.js
renders the original and the derived form preview. The derived preview is a
rendering resource, not editable state: changed widget appearances are generated
from the same field snapshot used for export. Superseded work is cancelled;
preview failures retain values and offer Retry. Required-field validation applies
when downloading, rather than blocking intermediate form completion.

V2 exports retain live AcroForm fields. Only changed field appearances are
regenerated. Unchanged fields retain their appearance streams. The production
editor keeps its established flattening behavior. The Phase 2 widget overlap
guard remains enforced in placement, adjustments and the worker: added content
cannot cover a live widget. Fill that field itself or place the addition in blank
space. This includes transparent padding around marks.

Preflight recorded SHA-256 values for 464 existing files and preserved scoped
copies under `.fats-private/pdf-tools-2-phase-3/preflight/`. Existing design work,
Phase 1/2 reports and evidence, and the original moodboards are preserved. No
reset, stash, commit, push, deployment, dependency or system-package installation
was performed.

## Implemented interactions

- **Text:** select Text, click visible paper, and type immediately. At desktop
  zoom of at least 75%, a textarea sits on the page. At lower zoom or on mobile,
  the selected text uses a full-size contextual textarea. Multiword text, explicit
  line breaks, wrapping and long-token wrapping use measured browser font widths.
  Native input shortcuts remain active. Escape or Ctrl/Cmd+Enter finishes editing;
  selecting the mark or its name in Page contents reopens it with the caret at
  the end. Page navigation retains text.
- **Formatting:** selected text/date controls offer 10–48 pt, regular/bold and
  navy/black/blue ink. Text-box resizing changes its layout without scaling its
  font. Height grows within page bounds; overflow and unsupported input remain
  editable and block download with an explanation. Geometry stays under Advanced.
- **Fields:** highlighted widget targets open the appropriate native value
  editor. Checkboxes and radio options can also be changed on the page. Page
  contents provides a named keyboard alternative. At low zoom, or whenever
  expanded 44 px targets would overlap, the page offers a grouped field picker.
  This avoids invisible hit regions intercepting neighboring controls.
- **Dates:** the date dialog starts empty. The user chooses both a date and
  Day Month Year or Year-Month-Day display, sees its preview, then places it.
  Selected dates can be changed, formatted, moved, resized, deleted and undone.
- **Initials:** Type or Draw reuses the existing signature dialog, measurement,
  transparent artwork and proportional resizing. Typed initials are limited to
  10 characters. Closing the document removes all session data; no reusable
  signature/initials library is created.
- **Checks/crosses:** place a checkmark and use its contextual Mark style to
  choose a cross. Both use the same selection, movement, resize, delete and
  history controls as other additions.
- **Shared behavior:** pending placement can be cancelled. Place on page supplies
  a keyboard alternative and searches for blank space near the center, avoiding
  widgets and existing additions. Explicit pointer collisions are rejected.
  Arrow keys move selected marks; Shift+arrows move 10 points. Resize handles,
  Larger/Smaller and Advanced provide keyboard alternatives. Pointer gestures
  create one undo entry. Text/field input commits as a transaction; new committed
  edits invalidate redo. The original file bytes are never overwritten.

The unsaved-work dialog protects replacement, closing and navigation. Rejected
replacement retains the current document and history. Export errors preserve
edits; processing, rendering and artwork encoding have bounded failure paths.
A successful download means bytes were checked and handed to the browser, not
that device saving was independently confirmed.

## Supported form-field matrix

| Field structure                                                                          | V2 behavior                                                          | Export                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Standard single-line text                                                                | Native text editor; maximum length, required and read-only enforced  | Live field value and regenerated appearance   |
| Checkbox                                                                                 | Direct toggle or native checkbox editor; read-only/required enforced | Live checked state and appearance             |
| Radio group                                                                              | Direct option or native radio group in contextual editor             | Selected export option and widget appearances |
| Non-editable, single-select dropdown                                                     | Native select with explicit options                                  | Selected value and appearance                 |
| Repeated widgets for one field                                                           | One shared value, including widgets on different pages               | Every instance updates                        |
| Read-only supported fields                                                               | Inspectable; modifications rejected                                  | Original value/appearance preserved           |
| Multiline/password/file-selector text; editable/multiselect dropdowns; other field types | Rejected clearly on opening                                          | No completed output                           |
| XFA, actions/scripts, attachments, signature structures, encrypted PDFs                  | Rejected by existing security inspection                             | No silent modification or security bypass     |

Changed text/dropdown appearances use embedded Helvetica, with measured fitting
up to 12 pt. Values that cannot fit at 8 pt are rejected with their input kept.
This avoids silently clipping or reducing long names to unreadable text. The
form repertoire is WinAnsi Western European text and supported punctuation;
unsupported characters receive a clear error. Existing untouched appearances
are not re-encoded merely because their text uses a different original font.

Added text uses the browser's Arial/sans-serif font and the same transparent PNG
painter for preview and export. Supported input is Latin/Latin-1, common
punctuation, € and ₱, with NFC normalization. Other scripts, emoji, hidden
controls and text over 500 characters per box are explicitly rejected without
truncating the editable source. Initials use the existing bounded signature
repertoire and local serif styles.

**Output limitation:** added text/dates/initials are embedded visual artwork.
Their text stays editable/selectable as input during the FATS session, but is
not searchable PDF text or editable FATS objects after reopening the exported
file. Live PDF field values remain interactive. Original printed paragraphs are
not editable; OCR, accessible PDF tagging and certified signing are not claimed.

## Independent export evidence

Poppler 26.06.0 was already installed at
`/nix/store/63r5wi3sdvwalqcdibpipnyl35swdzzg-poppler-utils-26.06.0/bin`.
No installation was needed. The tests use `PDF_TOOLS_POPPLER_BIN`; without it
independent verification is explicitly reported NOT RUN.

The synthetic five-page employment/onboarding fixture includes an offer letter,
employee form, Letter/cropped A4/landscape/small pages, 0/90/180/270 degree
rotations, nonzero crop origin, all four field types, a read-only reference,
required name, and a repeated field on the rotated page. Mixed-tool exports
include multiline accented text with ₱ and punctuation, bold/blue formatting,
a resized text box, explicit date edits, typed and drawn initials, a check and
a cross. One page has no changes.

The browser performs real local open → field completion → additions → page
navigation → undo/redo → download → reopen. `pdfinfo -box`,
`pdftotext -cropbox -layout`, `pdfimages -list`, and
`pdftoppm -r 144 -cropbox -png` inspect the actual downloaded bytes.

Verification separates the two intended change classes:

1. Compare Poppler renders of the untouched original and a fields-only export.
   Every RGB change must lie in an intentionally edited widget rectangle plus
   a 3-point margin. Original page content streams are also checked unchanged
   in the form-only engine integration test.
2. Compare the completed export against the field-updated baseline, composited
   with the actual preview artwork at model coordinates. Changes outside added
   mark rectangles plus 3 points must be zero. Ink recall/precision must exceed
   0.94 within a one-point raster neighborhood; bounds must differ by at most
   1.1 points. Transparent regions must preserve the underlying document beyond
   the small raster halo. Each added mark must have a transparency soft mask.

Final mixed-document runs passed on desktop and mobile:

| Independent measurement                                      | Desktop   | Mobile    |
| ------------------------------------------------------------ | --------- | --------- |
| Pages / transparent added marks                              | 5 / 7     | 5 / 7     |
| Ink recall / precision                                       | 1.0 / 1.0 | 1.0 / 1.0 |
| Maximum ink-bound error                                      | 0.5 pt    | 0.5 pt    |
| RGB changes outside intended mark regions                    | 0         | 0         |
| Unexplained transparent-region changes                       | 0         | 0         |
| Form-only changes outside edited widgets                     | 0         | 0         |
| Exact RGB changes on the untouched page                      | 0         | 0         |
| Page count/order/boxes/rotations and baseline extracted text | Preserved | Preserved |

Form-only differences are confined to 3,575 pixels on the employee form and
978 pixels on the repeated rotated widget page. All other pages match the
original exactly before added marks. Live exported field values match the
entered text, checkbox, radio and dropdown values after reopening. The separate
overlapping blue-check/black-cross export also passes Poppler verification,
while an actual browser screenshot pixel confirms selecting the earlier check
does not bring its artwork above the later cross.

PDF.js and Poppler rasterize original fonts and antialias edges differently.
Their raw preview rasters are therefore not pixel-identical. Across the five
pages, pixels differing by more than 32 RGB levels number 73,989 before additions
and 95,469 after on desktop; mobile counts are 33,135 and 45,678. Independent
comparisons use Poppler's own field-updated baseline to separate those viewer
raster differences from misplaced or missing additions. This is representative
synthetic-fixture evidence, not universal compatibility with every PDF/viewer.

## Screenshots and local PDF examples

Screenshots are actual, synthetic browser captures, not mockups. Desktop uses
1440 × 1100 CSS pixels; mobile uses Chromium's iPhone 13 profile, 390 × 664 CSS
pixels at device scale 3. A separate case checks 320 × 568. The keyboard image
uses a simulated 380 px visual viewport and does not show a real device keyboard.

| State              | Desktop                                                       | Mobile                                                          |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------------------------- |
| Completed document | [Workspace](assets/pdf-tools-2-phase-3/workspace-desktop.png) | [Workspace](assets/pdf-tools-2-phase-3/workspace-mobile.png)    |
| Active added text  | [On-page typing](assets/pdf-tools-2-phase-3/text-desktop.png) | [Contextual typing](assets/pdf-tools-2-phase-3/text-mobile.png) |
| Completed fields   | [Fields](assets/pdf-tools-2-phase-3/fields-desktop.png)       | [Fields](assets/pdf-tools-2-phase-3/fields-mobile.png)          |

Independent renders: [offer](assets/pdf-tools-2-phase-3/poppler-page-1.png),
[employee form](assets/pdf-tools-2-phase-3/poppler-page-2.png),
[rotated/cropped page with drawn initials](assets/pdf-tools-2-phase-3/poppler-page-3.png),
[cross on the 270-degree page](assets/pdf-tools-2-phase-3/poppler-page-5.png).
[Simulated mobile keyboard](assets/pdf-tools-2-phase-3/mobile-keyboard-simulation.png).
These images were visually inspected for clipping, accents, peso glyph, wrapping,
transparent initials, field values and placement.

Actual local artifacts, intentionally ignored by Git:

- [Completed desktop PDF](../.fats-private/pdf-tools-2-phase-3/examples/completed-onboarding-desktop.pdf)
  and [original](../.fats-private/pdf-tools-2-phase-3/examples/original-onboarding-desktop.pdf).
- [Completed mobile PDF](../.fats-private/pdf-tools-2-phase-3/examples/completed-onboarding-mobile.pdf).
- [Overlapping-mark example](../.fats-private/pdf-tools-2-phase-3/examples/completed-overlapping-marks.pdf).
- Metrics: `examples/poppler-{desktop,mobile}.json` and
  `examples/form-regions-{desktop,mobile}.json` under the same private directory.
- Complete raw evidence: `.fats-private/pdf-tools-2-phase-3/verified-v2/` and
  `verified-editing/`. Earlier failing attempts remain available for diagnosis.

## Defects repaired during integration

- Original widget appearances could hide added content. V2 retains the Phase 2
  geometry guard for every tool; disabled field targets now let placement reach
  that guard and produce an explicit collision error.
- Expanded minimum-size field targets intercepted neighboring fields at low zoom.
  Overlapping targets now use the named field picker instead.
- Direct widget selection initially focused a hidden Done button. It now focuses
  the native field editor, with Done restoring focus to the widget/picker.
- The new mobile toolbar and expanded inspector could reduce the document stage
  to zero height. Inspector height is now bounded by the document region, and the
  redundant signing guide is hidden while mobile properties are expanded.
- Artwork encoding had an unbounded browser callback. It now fails after the
  existing 15-second processing limit, releases busy state and retains history;
  a deliberately stalled callback and successful retry are browser-tested.
- Selecting an earlier overlapping mark raised its artwork above later marks,
  disagreeing with export order. Selection now raises only interaction controls;
  the artwork retains document order. A real screenshot-pixel regression exposed
  the blue check incorrectly covering a later black cross on both viewports.
  Independent rendering also checks the repaired overlapping-mark export.
- Form appearance errors retain their fixed, actionable fitting/glyph message.
  Invalid added text on another page is selected for correction during export
  validation instead of leaving its editor on an unrelated page.

## Regression and quality results

- PASS: focused PDF unit tests, 31/31, including wrapping, explicit/invalid dates,
  unsupported glyphs, overflow, field constraints, repeated widgets, unchanged
  content streams/appearances, unsupported field structures and collision checks.
- PASS: root TypeScript and ESLint checks across web, quality, domain and
  extension. Web/quality executed; unchanged domain/extension checks used Nx cache.
- PASS: repository Prettier check before this report was added; report formatting
  is checked again with final evidence.
- Full unit suite with its required local systemd access: **286/287 pass**.
  The only failure is the previously documented frozen matching-plan hash.
  The restricted sandbox run failed parser-isolation tests because it could not
  connect to the user systemd bus; that environment result is superseded by the
  native run, not hidden or treated as PDF regressions.
- PASS: complete V2 browser run — 32 passed, two intentional desktop skips for
  mobile-only viewport simulations. Includes the original Phase 1/2 journeys,
  actual encrypted/CMS-signed rejection, malformed files, limits, read and render
  failures, replacement, original-byte preservation, navigation, themes,
  keyboard/touch manipulation and independent Quick Sign export.
- PASS: final focused editing/touch run after the artwork-order fix — 20 passed,
  the same two intentional desktop skips. It includes the added cross-page error
  correction and overlapping-artwork screenshot/Poppler regression. No runtime
  console/page errors were observed in the instrumented journeys.
- PASS: fresh production build with Nx cache skipped and AI/account services
  disabled for the command.
- PASS: original production editor and development-route boundary browser run —
  6/6 across desktop/mobile. Real form filling, signatures, multi-page export,
  malformed/unsupported input, limits and discard behavior still work. V2 and the
  comparison prototype show not-found with no workspace; production navigation
  continues to link only to `/resumes/pdf-tools`.
- PASS: final repository formatting and `git diff --check`. Preservation audit
  found all 464 baseline files present; changes to baseline files are confined
  to the requested PDF implementation and corresponding V2 tests. The design
  prototype, prior reports/evidence, package manifests/lockfile, matching code,
  and moodboards retain their preflight bytes. Generated `next-env.d.ts` was
  restored to its exact preflight content after the build.

### Executed commands and evidence

Node 24.21.0, pnpm 11.27.0, Next 16.4.0, PDF.js 6.4.299, pdf-lib 1.17.1,
Playwright 1.64.1 and the already installed Poppler 26.06.0. Nx checks use
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. Browser tests retain Chromium's
sandbox, isolate contexts, use loopback ports and disable AI/account services.

| Check                                                           | Command / result                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PDF unit/integration                                            | `pnpm exec vitest run tests/unit/pdf-tools*.test.ts` — 31 pass                                                                                                           |
| All units with local parser isolation available                 | `pnpm exec vitest run --maxWorkers=1 --no-file-parallelism` — 286 pass, the one frozen matching-plan failure; `unit-native.log`                                          |
| TypeScript                                                      | `pnpm typecheck` — PASS; latest test additions also checked with `pnpm exec tsc -p tsconfig.tools.json --noEmit`                                                         |
| ESLint                                                          | `pnpm lint` — PASS                                                                                                                                                       |
| Formatting                                                      | `pnpm format:check` — PASS; report formatted again after final results                                                                                                   |
| Full V2 browser run                                             | `pnpm exec playwright test --config=playwright.pdf-v2.config.ts --output=.fats-private/pdf-tools-2-phase-3/verified-v2` — 32 pass, 2 intentional skips                   |
| Final editing and touch regression after selection-order repair | Same config, scoped to `document-editing.spec.ts` and `quick-sign-interactions.spec.ts`, output `verified-editing` — 20 pass, 2 intentional skips                        |
| Independent rendering                                           | Both V2 runs use `PDF_TOOLS_POPPLER_BIN` at the installed path and `FATS_TEST_PORT=3200`; actual downloaded PDF inspections/comparisons pass                             |
| Production build                                                | `pnpm build --skip-nx-cache` — PASS, `build.log`                                                                                                                         |
| Production editor/boundary                                      | `FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3201 pnpm exec playwright test tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts` — 6 pass; output `production` |
| Preservation                                                    | Preflight hash comparison and `git diff --check` — PASS; `preservation-audit.json`                                                                                       |

Logs and named output directories above are under
`.fats-private/pdf-tools-2-phase-3/`. The earlier selection-order test failed
on both viewports before repair (blue channel 128 desktop / 98 mobile at a
pixel that should show the later black cross); the same screenshot assertion
and independent PDF export pass after repair. Tests were not disabled or
weakened to obtain that result. Old raw-coordinate touch tests now scroll their
chosen PDF point into the actual visible document region and wait for restored
focus before dispatching gestures. Their movement/resize/undo assertions remain.

### Paused matching-plan failures

`tests/unit/matching-comparison-plan.test.ts:39` expects the frozen
`resume-extraction.ts` SHA-256
`23dd7d8ab99e4ab156686f9cb340b7a2d709a581f9d4b4acb8d2fa3417872bcb`.
The actual file and HEAD both hash to
`f6792e8725904e8021749c3a2ba2303ebaf0775ba378d9c3c52bbb6c27da8973`.
The matching implementation and test have no changes in this task. This is the
same exact documented failure signature, independently unrelated to V2.

The earlier second failure, the reconstruction assertion at line 87 expecting
`ready` but receiving `extraction_failed`, passes in the native serial suite.
Phase 2 already recorded its transient behavior and the shared four-parser
capacity. Its exact earlier OS-level cause remains unproven; do not describe
that historic event as a confirmed parser-capacity diagnosis. No paused AI code
or frozen expectations were changed to obtain a green suite.

## Accessibility and remaining release requirements

Automated Chromium checks cover named controls, keyboard placement and movement,
textarea shortcuts/focus, native field editors, modal focus restoration,
44 px targets, touch emulation, 320 px width and a simulated VisualViewport
software keyboard. These are not physical-device or spoken screen-reader tests.

The existing manual checklist also contains prototype-only statements about
not creating PDF output; those do not describe this real V2 editor. Apply its
device, focus and keyboard criteria here and review the actual downloaded PDFs.

Before any public release, complete the applicable manual checklist on iOS
Safari and Android Chrome, including real keyboard/IME composition, rotation,
zoom, safe areas and download behavior. Validate VoiceOver, TalkBack and a
supported desktop screen reader, reverse Tab, browser text enlargement and
spoken field/error announcements. The canvas is not an accessible reading or
text-selection interface for the original PDF. No WCAG conformance claim is made.

Thumbnails render page content and updated form appearances; added overlay marks
are reviewed in the main page view. Unknown viewers and complex documents beyond
the accepted field/security/page limits remain outside this representative test
matrix. No production exposure or expansion of accepted security structures is
part of this milestone.
