# PDF Tools 2.0 — Phase 4A page organization

21 October 2026. Development candidate: `/dev/pdf-tools-v2`.
Production editor: `/resumes/pdf-tools`.

**Phase 4A is implemented and its scoped PDF checks pass. Keep V2
development-only.** Reorder, rotation and removal use real PDF output and shared
Undo/Redo. Form-page removal and organization of unsupported page-dependent
structures are safely blocked. The full unit suite retains one unrelated paused
matching-plan hash failure, documented below.

## Architecture decisions

Page organization extends the existing `PdfEdits` / `PdfHistory`, processing
worker, PDF.js renderer and pdf-lib writer. There is no second exporter or
persistent document store. Quick Sign remains the default mode; organization
opens from the page rail or the phone's page chooser.

Preflight reviewed the design, Phase 1–3 verification, manual checklist,
original security/geometry boundaries and the installed pdf-lib 1.17.1 and
PDF.js 6.4.299 sources. SHA-256 snapshots of 486 existing files are retained in
`.fats-private/pdf-tools-2-phase-4a/preflight/hashes.json`. Existing uncommitted
design/engineering work is the baseline, not something to reset or replace.

Key implementation paths:

- [Page transformations and compatibility validation](../apps/web/src/lib/pdf-tools-organization.ts).
- [Shared history, content editing and download controller](../apps/web/src/lib/use-pdf-tools-quick-sign.ts).
- [Thumbnail organizer](../apps/web/src/components/pdf-tools-v2/organize-pages.tsx)
  and [workspace](../apps/web/src/components/pdf-tools-v2/workspace.tsx).
- [Existing writer](../apps/web/src/lib/pdf-tools-engine.ts),
  [renderer](../apps/web/src/components/pdf-tools-v2/page-canvas.tsx) and
  [download verifier](../apps/web/src/lib/pdf-tools-quick-export.ts).

The writer moves **the same page objects inside the loaded source document**.
It does not copy pages into a new PDF. Before detachment it materializes inherited
Resources, MediaBox, CropBox and Rotate values, then removes/reinserts leaves in
the requested order using the installed library's existing-page APIs. Existing
page, AcroForm and widget references therefore retain their identities. The
installed implementation was inspected because inserting a page changes its
parent, and failing to pin inherited attributes could lose resources or geometry.
The [official pdf-lib API](https://pdf-lib.js.org/docs/api/classes/pdfdocument#insertpage)
documents existing-page insertion; the versioned installed source is the authority
for these inheritance details.

PDF.js renders each original source page with its final rotation. Its viewport
inverse is checked against `viewToPdf`, including nonzero crop origins. This uses
the existing renderer's rotation parameter rather than a CSS-only rotation; see
the [official PDF.js API source](https://mozilla.github.io/pdf.js/api/draft/api.js.html).
The same inverse drives placement, widget outlines, movement and export. Export
reopens the completed bytes, checks final ordered geometry and renders every
remaining page before browser handoff.

## Implemented operations and interaction walkthrough

1. Open a local PDF, then choose **Organize pages** below the desktop Pages
   heading, or open **Pages → Organize pages** on a phone. The main signing
   toolbar gains no page-operation buttons.
2. Select a thumbnail. The selected border, pressed state and **Page N of M**
   describe its current position. Each thumbnail also names its original page,
   so repeated moves remain understandable. Thumbnails include current field
   appearances and added marks.
3. Use **Move earlier**, **Move later**, or **Move to position**. Desktop users
   can drag a dedicated handle onto another thumbnail to move to that position.
   Dropping onto the same position creates no history entry. Pointer cancellation
   does not commit a page operation. Named controls provide keyboard/touch parity.
4. **Rotate left/right** turns the page 90°. Existing content and additions rotate
   together. Newly placed content is upright in the current view. Text with a
   rotated artwork orientation uses the full-size contextual editor; it remains
   editable, movable and resizable.
5. **Remove page** asks for confirmation. **Keep page** changes nothing. Confirming
   removes that page and its session additions together and selects a surviving
   neighbor. The final remaining page cannot be removed.
6. **Undo/Redo** inside the organizer use the same history as the main workspace.
   Ctrl/Cmd+Z and redo shortcuts work outside native inputs. Modal shortcuts stop
   propagation, preventing a second history step in the surrounding workspace.
   Done returns focus to the opening control. Buttons explain disabled operations.
7. Close the organizer, review the reorganized document and download a real
   completed PDF. Failed attempts preserve edits/history and permit retry. The
   existing unsaved-work warning also protects page-only changes.

## Stable identity and history guarantees

`PdfPageEdit.source` is the immutable zero-based page identity in the original
PDF bytes, scoped to this open document. It is never the displayed position.
The ordered page plan holds each surviving source at most once, with a bounded
quarter-turn delta. `PdfElement.page`, widget page associations and form-field
page associations continue to refer to source identities. React page/thumbnail
keys and PDF.js page access use the same identities.

Reordering changes only the plan. Rotation changes the plan and transforms all
marks on that source page in one transaction, swapping their visible bounding
dimensions and recording their artwork orientation. Text measurement and the
shared PNG painter use native artwork dimensions, preserving wrapping, glyphs,
signature proportions, dates and check/cross geometry. Form widgets retain their
PDF-space rectangles and use the rotated viewport. The existing live-widget
overlap guard applies to transformed additions and all new placements.

Removal filters the page and its additions out of the active snapshot. The prior
snapshot retains both for Undo. Form-document removal is deliberately rejected,
so this phase never leaves an orphaned field value. Export independently rejects
empty plans, duplicate/out-of-range identities, invalid rotations and additions
attached to inactive pages. Pending marks and selected content clear on page
operations/history steps. A removed selected page always resolves to a survivor.

Each completed move, rotation or removal adds one bounded history entry. The
existing limit is 50 entries; this is not unlimited recovery. Pending text/form
transactions commit before page operations. New edits invalidate redo; no-op
moves, page selection, scrolling, zoom and modal opening do not. Download success
records the exact handed-off snapshot; a later page change makes it unsaved again.

## Supported and rejected structures

| PDF structure                                                                                                                                                                               | Page organization behavior                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Plain unsigned PDF, including static visual signatures and existing text/images                                                                                                             | Reorder, rotate and remove; original page artwork retained                                                              |
| Mixed dimensions, effective crop boxes, nonzero crop origins and orthogonal existing rotations                                                                                              | Supported within existing page limits                                                                                   |
| Standard supported text/checkbox/radio/dropdown AcroForms, including repeated widgets and read-only fields                                                                                  | Reorder and rotate; values and live widget references preserved                                                         |
| Any PDF with interactive form fields                                                                                                                                                        | Removal disabled for the entire document, including otherwise blank pages; no flattening workaround                     |
| Unknown/non-widget annotations, links, duplicate/misassociated/unowned widgets, NoRotate/NoZoom widgets                                                                                     | Organization disabled with an explanation; independent existing editing remains available within its established limits |
| Bookmarks/outlines, named destinations/name trees, page labels, default print ranges, logical tags/structure, article threads, calculation order, page-dependent actions/private structures | Organization disabled conservatively; no rebuilding or silent discarding                                                |
| Unsupported form types, XFA, scripts/actions already excluded by intake, attachments, encryption                                                                                            | Existing intake rejection remains                                                                                       |
| Cryptographic signatures, signature fields, certification/permission markers, byte ranges or document/field modification constraints                                                        | Intake rejection; no output that implies preserved signature validity                                                   |

Existing intake limits still apply: PDF 1.0–1.7, unencrypted, at most 10 MiB,
1–50 pages, visible page sides of 72–2400 points and at most 150 supported fields.
There can be at most 100 added marks, 50 history entries and a 30 MiB completed
download. The existing parser, image-size and rendering deadlines remain active.

Reorder/rotation of standard forms preserves the same field/annotation/page
objects; only intentionally changed field appearances regenerate. V2 never
flattens forms to make organization succeed. The production editor retains its
established separate flattening behavior. Unknown structures are rejected for
organization, even where some individual operation might theoretically be safe.
This is a conservative compatibility boundary, not a claim of universal PDF
support.

Metadata is loaded with `updateMetadata: false`; title, author, page boxes,
native content streams and same-document references have structural checks.
Output serialization changes bytes, while the original local file and retained
input bytes remain unchanged. Removed pages disappear from the active page tree;
pdf-lib can retain unreachable objects in its serialization. **This is page
organization, not secure redaction or forensic content erasure.**

## Independent export verification

Synthetic documents only. The already installed Poppler 26.06.0 is selected by
`PDF_TOOLS_POPPLER_BIN`; no renderer or system package was installed. Real
downloads are saved, reopened and inspected using `pdfinfo -box`, `pdftotext`,
`pdfimages -list` and `pdftoppm -r 144 -cropbox -png`.

Verification separates original-page preservation from added-artwork placement:

- The original's independent renders are reordered and quarter-turned in a
  test canvas, then compared with independent renders of a page-organized
  baseline. Dimensions/order, extracted words and bidirectional ink coverage
  check actual visible content. Raw RGB discrepancies remain recorded. Rotated
  font hinting changes edge colors even when content streams are identical;
  a one-point raster neighborhood accounts for that behavior. Unrotated pages
  retain exact independent-render comparisons.
- The completed download is compared against that independently checked baseline
  composited with actual preview artwork. Existing Phase 2/3 checks still require
  zero RGB changes outside mark bounds plus a three-point margin, no unexplained
  transparent-area changes, ink recall/precision above 0.94 and bounds within
  1.1 points. Each mark must retain its transparency soft mask.
- Form exports are reopened as live AcroForms. Field values, repeated widgets,
  original field/widget references and final page rotations are checked.

The mixed-document journey exports original pages **3, 1, 2, 5**, with respective
additional clockwise rotations **90°, 270°, 180°, 90°**. Original page 4 is removed.
The surviving five additions include a signature, date, initials, rotated text
and new upright text placed after rotation. The removed page's checkmark is
restored with Undo and removed again with Redo. The source includes existing
visual-signature artwork. The separate live-form journey exports original pages
**2, 1, 3, 4, 5**, rotating the moved page 90° and retaining both instances of a
repeated contact field.

Final evidence lives under `.fats-private/pdf-tools-2-phase-4a/completion-v2/`:

- `page-organization-reorders-…`: actual `synthetic-completed.pdf`, original
  and arranged baseline PDFs, every Poppler render, `organization-pixels.json`,
  `poppler-comparison.json`, geometry/text/image inspections and preview artwork.
- `page-organization-preserve-…`: actual `forms-arranged.pdf`, corresponding
  source and ordered independent renders, extracted words and pixel metrics.
- `page-organization-failed-…`: actual `retry-completed.pdf` after the injected
  first processing-worker failure; no download occurs on the failed attempt.

Both desktop and mobile mixed-document comparisons record **zero changed pixels outside
added-mark bounds**, zero unexplained transparent-area changes, mark ink
precision/recall of **1.0**, and maximum mark-bound error of **0.5 point**.
For rotated original artwork, raw differences greater than 32/channel cover
0.175–0.625% of page pixels; these renders are not claimed to be bit-identical.
There is **zero missing or unexplained ink within the stated one-point raster
neighborhood**. The live-form journey's unrotated pages have zero such raw pixel
differences. Content-stream bytes, page references, boxes and metadata also have
separate structural assertions; pixel-neighborhood checks alone would not prove
that every PDF structure was preserved.

## Screenshots

Actual synthetic Chromium captures; desktop 1440 × 1100 CSS pixels and mobile
390 × 664 CSS pixels at device scale 3. They are evidence of browser rendering,
not design mockups or physical-device validation.

| State              | Desktop                                                                          | Mobile                                                                   |
| ------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Organizer          | [Page thumbnails and controls](assets/pdf-tools-2-phase-4a/organize-desktop.png) | [Touch organizer](assets/pdf-tools-2-phase-4a/organize-mobile.png)       |
| Final page view    | [Workspace](assets/pdf-tools-2-phase-4a/workspace-desktop.png)                   | [Workspace](assets/pdf-tools-2-phase-4a/workspace-mobile.png)            |
| Independent output | [Poppler page](assets/pdf-tools-2-phase-4a/poppler-organized-desktop.png)        | [Poppler page](assets/pdf-tools-2-phase-4a/poppler-organized-mobile.png) |

Follow-up review screenshots:

| State                                      | Desktop                                                                                          | Mobile                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Focus after removal; final-page protection | [Selected survivor](assets/pdf-tools-2-phase-4a/removal-focus-desktop.png)                       | [Selected survivor](assets/pdf-tools-2-phase-4a/removal-focus-mobile.png)                       |
| Unsafe print-range organization            | [Explanation and disabled controls](assets/pdf-tools-2-phase-4a/print-range-blocked-desktop.png) | [Explanation and disabled controls](assets/pdf-tools-2-phase-4a/print-range-blocked-mobile.png) |

## Executed checks

Node 24.21.0, pnpm 11.27.0, pdf-lib 1.17.1, PDF.js 6.4.299 and the existing
Poppler 26.06.0 installation. Local browser checks keep Chromium's sandbox
enabled, use isolated synthetic documents and clear account/provider environment
settings through the existing Playwright configuration.

| Result                                    | Check                                                                                                                                                                                                                                                                                    | Evidence                                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS                                      | `pnpm exec vitest run tests/unit/pdf-tools-organization.test.ts tests/unit/pdf-tools.test.ts tests/unit/pdf-tools-editing.test.ts tests/unit/pdf-tools-quick-sign.test.ts tests/unit/pdf-tools-viewport.test.ts tests/unit/pdf-tools-worker.test.ts tests/unit/pdf-tools-design.test.ts` | 38/38; `completion-pdf-units.log`                                                                                                             |
| FAIL, unrelated paused matching assertion | `pnpm exec vitest run --no-file-parallelism` with the existing native document sandbox available                                                                                                                                                                                         | 293 pass, 1 fail; `completion-native-units.log`; failure details below                                                                        |
| PASS                                      | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck`                                                                                                                                                                                                                                | All four projects; changed web/quality checks execute; unchanged domain/extension cached; `completion-typecheck.log`                          |
| PASS                                      | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`                                                                                                                                                                                                                                     | All four projects; changed web/quality checks execute; unchanged domain/extension cached; `completion-lint.log`                               |
| PASS                                      | `PDF_TOOLS_POPPLER_BIN=/nix/store/63r5wi3sdvwalqcdibpipnyl35swdzzg-poppler-utils-26.06.0/bin FATS_TEST_PORT=3200 NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm exec playwright test --config=playwright.pdf-v2.config.ts --output=.fats-private/pdf-tools-2-phase-4a/completion-v2`      | 51 pass, 3 intentional skips in 7 minutes; `completion-v2.log`; actual downloads and independent rendering included                           |
| PASS                                      | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build --skip-nx-cache` with scoped native process access                                                                                                                                                                                  | Uncached production build, 15.4 seconds; `completion-native-build.log`                                                                        |
| PASS                                      | `FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3201 NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm exec playwright test tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts --output=.fats-private/pdf-tools-2-phase-4a/completion-production`                                    | 6/6 across desktop/mobile; real production form/signature/export regressions and unavailable V2/prototype routes; `completion-production.log` |
| PASS                                      | `pnpm format:check` and `git diff --check`                                                                                                                                                                                                                                               | Final formatting and whitespace checks; `completion-format-final.log`                                                                         |
| PASS                                      | Preflight SHA-256 preservation audit                                                                                                                                                                                                                                                     | Original moodboards, earlier design/report/evidence files and unrelated work preserved; `completion-preservation-audit.json`                  |

The three deliberate browser skips are desktop-only drag on the touch project
and the two mobile software-keyboard simulations on the desktop project. Their
applicable counterparts pass. All 15 applicable organization cases pass across
desktop/mobile. Physical devices and spoken screen readers remain NOT RUN.

Logs and named evidence directories in this section are under
`.fats-private/pdf-tools-2-phase-4a/`. The preservation audit compares all 486
initial files, permitting only the eleven existing implementation files changed
for page organization. A separate 498-file completion snapshot records the
candidate as found, including the already-present organization implementation.
The completion pass changes the report, regenerates a Phase 4A mobile capture,
and formats the organization unit test; it preserves the candidate's source and
all unrelated work. The initial test-formatting failure is corrected before the
final full formatting check. No dependencies, lockfiles or earlier reports are
changed. A byte-for-byte copy of the final six-image gallery and its hashes is
retained privately with the verification evidence.

The PDF unit suite covers stable identities and repeated moves; all four turns
in both directions on every mixed/cropped page; mixed content/page history;
removed-mark restoration; no-op moves; final-page rejection; invalid/duplicate
plans; additions attached to inactive pages; original input immutability;
inherited page attributes; same-object export; live form values/references; and
safe rejection of links, unknown annotations, tags, outlines, page labels,
special widget flags and misassociated widgets.

Browser journeys exercise one-, two- and five-page files; actual desktop drag;
keyboard-only organization and focus restoration; touch-emulated movement;
view-only history exclusion; mixed edits and page operations; crop/rotation
placement; live repeated form fields; unsupported structures; export failure
and retry; unsaved-work handling; narrow 320px controls; and reopening actual
downloads. Existing V2 foundation, Quick Sign, document-editing and security
journeys run alongside organization. Screenshots and runtime-error assertions
are part of those journeys, rather than substitutes for them.

### Environment failures and paused matching debt

The first restricted browser attempt could not bind `127.0.0.1:3200`
(`listen EPERM`); it did not exercise the journey. The scoped native browser
run uses that loopback test server and sandboxed Chromium. The initial restricted
full unit run had 20 failures, including explicit denied access to the local
user-systemd bus used by the existing document parser. Repeating the same suite
with that access resolves the parser/isolation failures and leaves one assertion.
No isolation checks were bypassed or weakened.

The restricted production build stayed in compilation with very little CPU
activity and was stopped after 2 minutes 48 seconds. The same uncached command
passes with scoped native access in 15.4 seconds. The precise blocked build
mechanism was not established; this is not reported as an application build
failure. `completion-build.log` retains the interrupted run. Generated Next
declarations are restored byte-for-byte after the build.

The remaining failure is
`tests/unit/matching-comparison-plan.test.ts:39`: the frozen extraction-source
hash expects
`23dd7d8ab99e4ab156686f9cb340b7a2d709a581f9d4b4acb8d2fa3417872bcb`,
but actual `apps/web/src/server/resume-extraction.ts` and `HEAD` both hash to
`f6792e8725904e8021749c3a2ba2303ebaf0775ba378d9c3c52bbb6c27da8973`.
The assertion file also matches `HEAD`. This is the same pre-existing failure
recorded in Phase 3, outside page organization. The other matching-plan tests
pass in the native run. No paused matching source, expectation or provider
configuration is changed; no live provider evaluation is run.

## Follow-up preservation review

The requested Phase 4A implementation, screenshots and this report were already
present as uncommitted work when the follow-up review started. They were retained
as the baseline. An additional SHA-256 manifest records 498 baseline files at
`.fats-private/phase-4a-review-141t0e72/preflight-hashes.json`; the original report's
implementation evidence above remains available.

The review found one additional page-dependent structure: `PrintPageRange` in
viewer preferences. Its values identify page **positions**, as documented in the
[official pdf-lib API](https://pdf-lib.js.org/docs/api/classes/viewerpreferences#setprintpagerange)
and the installed 1.17.1 source. For example, a two-page PDF with only its second
page selected for printing would retain the old second-page index after removing
its first page. Reordering could instead select a different original page.

This version has no reconciliation rule for those print presets. Inspection now
disables page organization for such documents, explains that default print ranges
are unsupported and directs the user to the source application. Independent
editing/export remains available with the print preset preserved. No preference
is silently cleared, no form is flattened and the accepted plain-document page
operations remain the same. This uses the existing conservative organization
boundary, including blocking rotation for this document class.

A new synthetic two-page regression fails before the repair because inspection
does not identify the positional preset. After the repair it checks the intake
explanation, independent export rejection of both reorder/removal plans, and an
unchanged export reopened with the original two pages and exact print preset.
The existing desktop/mobile unsupported-structure journey now includes this
fixture and checks disabled operations and unchanged history.

The complete follow-up V2 run also exposed an intermittent keyboard timing
failure immediately after confirming removal. Radix defers its close autofocus
until the confirmation unmounts; the organizer then deferred it by another
animation frame. The failing trace records the next Undo shortcut during this
transition, with removal still active in history. The close callback now focuses
the surviving selected thumbnail directly. The keyboard journey additionally
asserts that focus reaches that thumbnail before sending shortcuts, while
retaining the one-step Undo/Redo and opener-focus assertions. No global keyboard
listener or interception of native input editing was added.

The full run completed with 50 passes, 3 intentional device-specific skips and
that one keyboard failure. Its trace remains under `v2-final/`; subsequent
organization verification is recorded separately below. All other Quick Sign,
editing, security, foundation and independent-output scenarios passed. The full
unit run completed with 294 passes and the same one frozen matching-plan hash
failure. `matching-baseline.json` confirms both relevant matching files still
match HEAD; this review changes neither implementation nor expectations.

Follow-up command logs and fresh browser/download artifacts are retained in
`.fats-private/phase-4a-review-141t0e72/`. Results below are updated only after
execution completes; the original implementation results above are historical.

| Result                                                  | Follow-up check                                                                                                                             | Evidence                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| PASS                                                    | `pnpm exec vitest run tests/unit/pdf-tools*.test.ts` — 39 tests                                                                             | `pdf-units-final.log`; the failing-before repair is `print-range-before.log`                                                |
| PASS                                                    | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck`                                                                                   | `typecheck-final.log`; web/quality execute, unchanged domain/extension use cache                                            |
| PASS                                                    | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`                                                                                        | `lint-final.log`; web/quality execute, unchanged domain/extension use cache                                                 |
| FAIL on initial review run; focus repair verified below | Complete V2 browser journeys with installed Poppler — 50 pass, 3 intentional skips, 1 keyboard failure                                      | `v2-final.log` / `v2-final/`; failure trace retained                                                                        |
| PASS                                                    | Affected organizer journeys after the focus repair — 15 pass, 1 intentional mobile skip of desktop drag                                     | `organization-final.log` / `organization-final/`; includes real downloads, Poppler pixels and focus/print-range screenshots |
| FAIL, unrelated paused matching assertion               | `FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= pnpm exec vitest run --no-file-parallelism` — 294 pass, 1 frozen-hash failure | `all-units-native.log`; matching files equal HEAD in `matching-baseline.json`                                               |
| PASS                                                    | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build --skip-nx-cache`, with account/provider settings empty and matching disabled           | `build.log`; uncached local production build completes in 20.3 seconds                                                      |
| PASS                                                    | Production PDF editor/boundary regression — 6 pass                                                                                          | `production.log` / `production/`; actual form filling, signing and multi-page export; both dev routes unavailable           |
| PASS                                                    | `pnpm format:check`, `git diff --check` and the 498-file preservation audit                                                                 | `format.log` / `preservation-audit.json`; final report formatting checked again after recording results                     |

The full V2 command uses `PDF_TOOLS_POPPLER_BIN` at the installed path above,
`FATS_TEST_PORT=3210`, the existing `playwright.pdf-v2.config.ts` and output
`v2-final/`. The post-repair command adds
`tests/pdf-v2-e2e/page-organization.spec.ts` and writes `organization-final/`.
Unaffected V2 journeys reuse the complete run's evidence; the final change after
that run only shortens focus restoration inside the organizer. The initial
separate organizer review also passed 15 journeys with one intentional skip.

Production verification uses `FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3211` and
`pnpm exec playwright test tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts`
with output under `production/`. All six desktop/mobile checks pass against the
fresh production build.

The preservation audit confirms all 498 baseline files remain. Exactly six
existing files changed in this follow-up: the organization compatibility check,
organizer focus callback, corresponding fixture/unit/browser tests and this
report. Four new screenshot files supplement the existing gallery. All previous
screenshots, design work, Phase 1–3 evidence, package/lockfiles, matching files and
three original moodboards retain their baseline bytes. Generated Next declarations
were restored from the preflight copy after build and production verification.
See `preservation-audit.json`. No commit, push, publication or deployment occurred.

The restricted browser launch could not bind the loopback port (`listen EPERM`).
The scoped native runs retain Chromium's sandbox and disable account/AI services.
The native unit run uses the existing synthetic parser sandbox. No browser,
renderer or system package was installed.

Fresh organization downloads reproduce the original independent measurements:
correct order/geometry, zero missing or unexplained original ink within the
one-point neighborhood, zero changed pixels outside additions, added-mark ink
precision/recall 1.0 and maximum bounds error 0.5 point. Both new focus and
unsupported-state screenshots were visually inspected at desktop/mobile sizes.
The mobile compatibility explanation uses the existing scrollable error region.

## Phase 3 searchable-text assessment

The limitation is **architectural and deliberately retained in this phase**.
The existing canvas painter supplies transparent PNGs for both preview and export.
That gives consistent browser glyphs, wrapping and visual signatures, including
the supported peso symbol, but the writer embeds the pixels with `drawImage`.
The session's text source never becomes PDF text-showing operators or a font
character mapping. Rotation preserves that same functional behavior.

Consequences:

- Added text/dates are visually readable but cannot be selected, searched or
  extracted as PDF text after download. Reopening does not restore FATS objects.
- Original searchable text stays searchable. Live form values remain actual
  interactive values with their existing independent accessibility/extraction
  limits. Artwork is not a substitute for AcroForm field values.
- Raster text supplies no document reading order, language, structure tags or
  screen-reader semantics. Merely adding an invisible searchable text layer would
  not establish accessible tagging and could duplicate or misalign extracted text.

Recommend a focused **selectable added text and dates** remediation milestone
before production release. It should share one measured text layout between
preview/export, embed licensed local fonts with the required glyph repertoire and
Unicode/ToUnicode mappings, and emit real PDF text with correct line baselines,
weights, color, crop offsets and every supported rotation. The current Latin
repertoire, € and ₱ need explicit font coverage; a standard WinAnsi font alone
does not cover the whole current repertoire. Broader scripts would additionally
require shaping/bidirectional handling and their own scope.

Keep visual signatures/drawn initials as artwork. Preserve live AcroForm data,
widget overlap behavior and history. Decide separately whether semantic dates
or initials should be text. Test selection/copy/search and exact extraction in
PDF.js and Poppler, alongside pixel fidelity, reflow/wrapping, form interaction,
font embedding/subsetting and accessibility semantics. Tagged accessible output
is a separate acceptance criterion; do not infer it from searchability. No text
engine rewrite, hidden OCR layer or new dependency is included here.

## Remaining limits and Phase 4B readiness

Merge, split and extract are not implemented. This same-document strategy does
not establish safe cross-document page copying or destination/form reconciliation.
Phase 4B must explicitly define document ownership, copied field-name collisions,
shared widgets, destination/tag/outline handling and independent export evidence
before extending the model. Form-page removal remains blocked until an explicit
widget/field cleanup design can preserve surviving instances and Undo.

The tested plain-document organization slice is ready for Phase 4B planning.
It is not evidence that merge/split/extract or cross-document form copying can
ship safely; those operations require their own model and compatibility review.

V2 remains development-only. Physical iOS Safari/Android Chrome, real software
keyboards/IME, spoken VoiceOver/TalkBack/desktop screen readers, other browser
engines and participant usability tests remain NOT RUN. The original
[manual checklist](PDF_TOOLS_2_MANUAL_CHECKLIST.md) remains unpassed; its
prototype-only no-export statements do not describe the real V2 candidate.
No accessible PDF reading/tagging, signature certification, persistent recovery
after mobile tab termination or universal viewer compatibility is claimed.

Processing remains browser-only and memory-only. No uploads, Career Vault,
ClamAV installation, AI/provider calls, external PDF service, deployment,
publication, commit or push is part of this work.
