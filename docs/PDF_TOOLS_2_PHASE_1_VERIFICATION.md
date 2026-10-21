# PDF Tools 2.0 — Production Phase 1 verification

20 October 2026. **Ready to begin Phase 2 engineering; keep V2 development-only.**
This milestone connects the approved workspace direction to real local PDFs. It
does not release a replacement editor or implement V2 signing, editing or export.

## Entry points and preflight

- Real candidate: `/dev/pdf-tools-v2`, available only with `next dev`.
- Interactive synthetic comparison: `/design/pdf-tools`, preserved.
- Existing production editor: `/resumes/pdf-tools`, preserved and regression tested.

Read root/web instructions, the design, design review, manual checklist, existing
PDF Tools specification and verification report. Inspected the production model,
processing client/worker, validation, PDF.js renderer, mark painter, history and
export path before editing. Used the installed Next 16.4 client/CSS guides and
PDF.js 6.4.299 source/types for viewport and worker behavior.

The design milestone was **uncommitted** at preflight. Existing modifications
were the design `model.ts`, `workspace.tsx`, `workspace.module.css`, both design
documents, `tests/design-e2e/pdf-tools-design.spec.ts` and `tools/project.json`.
Untracked signature/viewport helpers, manual checklist, design unit/interaction
tests and refined/final screenshot galleries were also present. These files were
not edited. The three shared production files changed below were clean initially,
so no overlapping-file blocker required modifying or discarding design work.
A preflight SHA-256 manifest protects 67 existing files, including that work,
earlier screenshots, moodboards and the generated Next declarations.

No dependency, lockfile, production navigation, server, security, storage,
quarantine or AI configuration change is included. No commit, stash, reset, push
or deployment was performed.

## Architecture and integration decisions

| Responsibility                  | Implementation / decision                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document model and restrictions | Reuse `pdf-tools-model.ts` / `PdfInfo` / `PdfPageInfo` and the existing limits. No second editing model.                                                                                              |
| Validation and processing       | Reuse `LocalPdfWorker`, `pdf-tools.worker.ts` and `inspectLocalPdf`. Add an `inspect` action returning the validated original bytes unchanged. Existing `open` / `export` behavior stays intact.      |
| PDF loading and page geometry   | Extract the existing bundled PDF.js worker/configuration into `pdf-tools-renderer.ts`; both workspaces use it. `checkedPdfPage` verifies actual PDF.js geometry against the existing export contract. |
| Document lifetime               | `use-pdf-tools-document.ts` owns validation/loading, document generation, deadlines, failure and cleanup. It is independent of visual layout.                                                         |
| View state and coordinates      | Workspace page selection, fit mode and scroll are transient view state. `pdf-tools-viewport.ts` maps actual PDF.js viewports to CSS client coordinates and controls raster allocation.                |
| Workspace UI                    | New `pdf-tools-v2/` components and CSS Modules retain the compact header, centered white paper, light/dark/system appearance, 124px collapsible desktop rail and mobile page chooser.                 |
| Future editing/export           | Continue with existing `PdfEdits`, `PdfHistory`, local mark painter and export worker. Phase 1 does not create history, marks or completed copies.                                                    |

The old worker's `open` operation prepares a flattened editing preview. Reusing
that output directly would alter forms before V2 offers any editing. The smallest
adjustment is an inspection-only action in the same worker, rather than another
parser or export implementation. Browser SHA-256 assertions confirm that its
returned bytes equal the selected original. The processing worker is terminated
after inspection; one PDF.js document/worker supplies main pages and thumbnails.

The shared renderer preserves the established settings: local bundled worker,
XFA off, font-face loading off, local system fonts, WebAssembly off, worker fetch
off, fixed quiet diagnostics, image/canvas limits and strict parsing. Raster form
appearances are enabled; no HTML annotation/link, scripting or text layer is added.
The existing editor now calls the extracted loader and checked-page helper; its
editing/export code and markup are otherwise unchanged.

PDF.js loading and rendering APIs were checked in the installed
[implementation](../apps/web/node_modules/pdfjs-dist/build/pdf.mjs) and
[viewport type contract](../apps/web/node_modules/pdfjs-dist/types/src/display/page_viewport.d.ts).
The existing architecture and supported subset remain described in
[PDF Tools](PDF_TOOLS.md).

## Actual capabilities

Open a local PDF, validate it through the real processing worker, render its actual
pages and existing field appearances, choose real page thumbnails, use Previous /
Next or the native page selector, scroll between pages, zoom 25–200%, Fit page,
Fit width, inspect document information, replace or close it. Fit modes calculate
each page's size independently, so mixed dimensions do not reflow the whole
document when scrolling changes the current page. Explicit zoom retains the
viewport-center anchor where scroll bounds permit.

Named controls, a document-controls skip link, current-page state, focusable scroll
region, native selectors, Radix dialogs with explicit focus restoration, loading
statuses and fixed error messages provide keyboard access. Narrow layouts retain
44px navigation buttons; at 320px zoom controls wrap to a second row. Page images
remain white with original colors in both themes. This is accessible editor
navigation, not accessible reading/tagging of arbitrary PDF content.

Signing, field editing and download are explicitly unavailable. There is no
simulated edit, signature placement, progress percentage or fake download.

## Coordinate contract

1. Use `PointerEvent.clientX/clientY` with the canvas's current
   `getBoundingClientRect()`. Both use CSS viewport coordinates; stage/window
   scroll and viewport offsets therefore cancel correctly.
2. Normalize the CSS location to the **actual PDF.js PageViewport** dimensions.
3. Call `convertToPdfPoint`; reverse with `convertToViewportPoint`. PDF.js supplies
   effective crop origin, page rotation and the viewport matrix.
4. Keep backing bitmap resolution separate. Device pixel ratio changes raster
   density, never PDF geometry. Rounded allocation remains within 4 million pixels
   per canvas. No synthetic HTML page-coordinate formula is reused.

For each rendered page, verify width/height and all four inverse-mapped corners
against the existing engine's `viewToPdf` export contract (0.01pt tolerance).
A geometry disagreement fails rendering instead of presenting a misleading canvas.
The canvas boundary emits a local `pdf-tools-point` event with page and PDF point;
it does not create an editable object or persist coordinates.

Unit/integration checks use real PDF.js page proxies, all 0/90/180/270 rotations,
Letter/A4/landscape/small pages, nonzero CropBox and MediaBox origins and their
intersection, 25/50/100/137/200% zoom, viewport offsets, negative scrolled DOM
rectangles, and DPR 1/2/3 raster budgets. Numerical round trips agree to eight
decimal places. Browser tests independently find a colored landmark in actual
PDF pixels, tap/click its CSS centroid, and check the returned PDF point on three
rotated pages at 25/100/200%. The 2.1pt pixel-sampling tolerance accommodates
rasterization at overview zoom; it is not a V2 export-accuracy claim.

## Resources, errors and security

Generation checks prevent stale reads/worker results from reviving a replaced or
closed document. Close, replacement and unmount destroy processing/PDF.js resources;
render effects cancel tasks, clear deadlines and zero discarded canvas bitmaps.
Main canvases mount for visible pages and selected-page neighbors; other pages
retain their layout placeholders. Thumbnails use small 84px rasters. The existing
15-second processing deadline is reused, with loading/page-render deadlines too.
These bounds are not an OS memory ceiling or a malicious-PDF safety guarantee.

Malformed, encrypted, wrong-extension, empty, oversized, active/unsupported,
excess-page and invalid-dimension files produce actionable fixed errors. Existing
form-type, signature, attachment, image and complexity restrictions remain in the
single validation implementation. A transient page failure offers Retry; a stopped
renderer can be recovered by choosing the file again. Failed replacement after
structural validation starts clears the prior read-only document; original files
remain untouched. File-picker cancellation does nothing. An invalid extension or
byte-size selection leaves an already open document available with the error.

Selected bytes and values never enter a request or browser storage. The normal
theme preference may use existing localStorage; PDF content does not. No upload,
Career Vault save, account document import, server PDF parsing, scanner bypass,
cloud signing, AI, analytics or remote fonts were added. Quarantine/owner/hash and
upload restrictions remain untouched. Browser workers are not malware scanning;
live ClamAV remains unverified and was not installed or enabled.

## Executed verification

Node 24.21.0, pnpm 11.27.0, Next 16.4.0, pdf-lib 1.17.1, PDF.js 6.4.299,
Playwright 1.64.1 and sandboxed system Chromium. Browser contexts are isolated;
database/auth/provider environment overrides are blank and AI is disabled.
Local browser/build commands used scoped execution permission for loopback and
workers; Chromium's sandbox stayed enabled. Only generated synthetic PDFs were used.

| Result | Command / evidence                                                                                                                                                                                                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS   | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck` — four projects; changed web/tools checks executed, domain cached.                                                                                                                                                           |
| PASS   | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint` — four projects; web/tools checks executed, domain cached.                                                                                                                                                                        |
| PASS   | `pnpm exec vitest run tests/unit/pdf-tools-viewport.test.ts tests/unit/pdf-tools.test.ts tests/unit/pdf-tools-worker.test.ts tests/unit/theme.test.ts` — 27/27, including actual PDF.js geometry integration and existing engine/export/worker regressions.                            |
| PASS   | `FATS_TEST_PORT=3200 pnpm exec playwright test --config=playwright.pdf-v2.config.ts --output=.fats-private/pdf-tools-2-phase-1/verified` — eight desktop/mobile journeys.                                                                                                              |
| PASS   | `DATABASE_URL= BETTER_AUTH_URL= BETTER_AUTH_SECRET= FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= pnpm --filter @fats/web build` — optimized compilation, TypeScript and 20 generated routes.                                                                           |
| PASS   | `FATS_TEST_PORT=3201 FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts --output=.fats-private/pdf-tools-2-phase-1/production` — six checks: four existing-editor journeys and two production route-boundary checks. |
| PASS   | `pnpm format:check`, `git diff --check`, screenshot decoding/source hashes and protected-file manifest comparison.                                                                                                                                                                     |

The production editor's full real form/signature/export/reopen journey passes on
desktop and mobile, including independent exported-page pixel checks, all four
rotations, original-byte preservation, unsupported files and scan guidance.
Both development routes render not-found in production and no candidate navigation
appears on Resumes. The assertion is about the rendered boundary, not a required
HTTP status on a streamed response.

V2 checks cover single/multiple pages, real thumbnails, zoom/fit, scrolling, mobile
and 320px layout, both themes/system preference, keyboard dialogs/focus, touch taps
at multiple zooms, original inspection-byte equality and no export requests. They
observe zero external/non-GET requests and no PDF content in local/session storage.
Worker instrumentation observes zero live workers after close/unmount and one
renderer after replacement. A delayed read is closed/replaced without stale state.

Failure checks inject the processing worker's error event, **terminate an actual
PDF.js worker during document loading**, wait for the real deadline, reopen a valid
PDF, inject a transient canvas-context failure and successfully Retry the page.
These are controlled browser failure tests, not OS crash or physical-device tests.

During iteration, browser checks caught scroll-driven selection changes at overview
zoom and missing dialog focus restoration; both were fixed. A failure harness
initially terminated the renderer after thumbnails had cached operators, which can
still permit rendering; termination now occurs before document loading completes.
The Next route-announcer alert is excluded from document-error assertions. Final
checks retain the behavioral assertions rather than weakening them.

The two existing dynamic-filesystem tracing warnings at unchanged
`apps/web/src/server/document-scanner.ts:40–41` still appear in successful builds;
they are also recorded in the earlier verification report. No scanner/tracing
repair is included. Generated Next declaration imports were restored to their
preflight content after checks.

## Real-PDF screenshots

Unretouched browser renders in `docs/assets/pdf-tools-2-phase-1/`. All 15 images
were decoded and visually reviewed as a sheet, with desktop dark, mobile/narrow
and error states also opened individually. Only fictional Harborlight / Alex Rivera
data and explicit synthetic verification fixtures appear; no personal data or
secrets were observed. Originals and all earlier galleries remain preserved.

| State                                           | Evidence                                                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop light / dark                            | [desktop-light.png](assets/pdf-tools-2-phase-1/desktop-light.png), [desktop-dark.png](assets/pdf-tools-2-phase-1/desktop-dark.png)                                                                                    |
| Mobile light / dark                             | [mobile-light.png](assets/pdf-tools-2-phase-1/mobile-light.png), [mobile-dark.png](assets/pdf-tools-2-phase-1/mobile-dark.png)                                                                                        |
| Rotated and cropped page                        | [desktop](assets/pdf-tools-2-phase-1/desktop-rotated-cropped.png), [mobile](assets/pdf-tools-2-phase-1/mobile-rotated-cropped.png)                                                                                    |
| Fit width                                       | [desktop](assets/pdf-tools-2-phase-1/desktop-fit-width.png), [mobile](assets/pdf-tools-2-phase-1/mobile-fit-width.png)                                                                                                |
| Narrow 320px / page chooser                     | [mobile-320.png](assets/pdf-tools-2-phase-1/mobile-320.png), [mobile-page-chooser.png](assets/pdf-tools-2-phase-1/mobile-page-chooser.png)                                                                            |
| Document information / empty                    | [document-information.png](assets/pdf-tools-2-phase-1/document-information.png), [empty.png](assets/pdf-tools-2-phase-1/empty.png)                                                                                    |
| Unsupported file / failed renderer / page retry | [unsupported.png](assets/pdf-tools-2-phase-1/unsupported.png), [renderer-failure.png](assets/pdf-tools-2-phase-1/renderer-failure.png), [page-render-failure.png](assets/pdf-tools-2-phase-1/page-render-failure.png) |

## Limitations and Phase 2 recommendation

**Proceed with the staged Quick Sign implementation.** The real-PDF viewing and
coordinate foundation is ready; no broad design iteration is recommended.
Keep this entry point development-only until later release gates pass.

Phase 2 must connect the existing signature painter and edit history to this
viewport contract, provide named non-drag placement/move/resize/delete controls,
handle readable long/accidental-overflow signatures, and implement real download
revision/error states through the existing export worker. Verify actual exported
bytes independently across rotations/crops/fonts/diacritics and viewers before
claiming preview/export agreement. The Phase 1 point tests do not establish V2
signature readability, baseline accuracy, form editing or completed-copy quality.

NOT RUN: physical iOS Safari/Android Chrome, real software keyboards/IME/pinch
behavior, spoken screen-reader output, participant usability sessions, other
browser engines/PDF viewers, pathological/maximum-complexity memory stress, secure
RAM erasure, live malware scanning or real personal documents. The existing
[manual checklist](PDF_TOOLS_2_MANUAL_CHECKLIST.md) remains applicable when editing
is introduced; it has not been relabeled as passed. Full accessible PDF reading,
tagging, text selection, OCR, page operations, certified signing, library handoff
and persistent drafts are outside Phase 1. No server integration tests or AI
evaluations were required/run for this browser-only change.
