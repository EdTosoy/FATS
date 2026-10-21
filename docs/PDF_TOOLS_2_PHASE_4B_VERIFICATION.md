# PDF Tools 2.0 — Phase 4B extract and split

21 October 2026. Development candidate: `/dev/pdf-tools-v2`.
Production editor: `/resumes/pdf-tools`.

**Phase 4B's supported extract/split slice passes engineering verification and
is ready for Phase 4C planning. Keep V2 development-only.** Users can select
pages or split boundaries, review copies and download valid independent PDFs
without changing the original editing session. Unsafe structures are explicitly
blocked. Physical-device and spoken accessibility validation remain release
requirements; the full unit suite retains one unrelated paused matching failure.

## Preflight and preservation

Read the root/web instructions and the Phase 1, 2, 3 and 4A verification reports,
including Phase 4A's preservation review, print-range restriction and searchable
text assessment. Phase 4A is committed in `63962e6`, included in the current
merge `b103713`. The repository resolves to `/mnt/storage/projects/ats`.

At entry, a Phase 4B candidate was already staged: the organizer/output UI,
worker/writer integration, output planning/controller, unit/browser helpers and
twelve screenshots. There were no unstaged changes. This candidate was retained
as the baseline and reviewed rather than replaced. The completion work extends
the one-page browser check with independent Poppler inspection and exercises
keyboard/touch split boundaries and keyboard output-preview activation. This
report is new. Existing implementation and unrelated work are preserved.

A SHA-256 snapshot of 520 existing files, copies of the starting Phase 4B gallery
and the original generated Next declarations are under
`.fats-private/pdf-tools-2-phase-4b-completion/`. The matching source/test are
independently compared with HEAD. Final preservation results are recorded below.
The personal resume text supplied with the request was not used as test data.

The final audit preserves all 520 baseline files, with only the intended
page-output browser test changed during completion. The existing staged
implementation and twelve starting screenshots retain their baseline bytes.
All four existing `uiux/*.png` references, including the three original
moodboards, prior reports/galleries, package manifests/lockfile and matching
files remain unchanged. Browser regressions temporarily regenerated the two
Phase 4A organizer captures; those and generated Next declarations were restored
to verified preflight bytes. The new report and two Poppler evidence images are
additional files. See `preservation-audit.json`.

## Implementation decisions

| Responsibility           | Decision                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry point              | **Organize pages → Extract pages / Split document**. No permanent signing-toolbar buttons or production navigation changes.                                                                                                                    |
| Identity and order       | Reuse `PdfPageEdit.source`, `PdfEdits`, the active page plan and original immutable bytes. Range numbers mean current one-based positions. Outputs retain current document order, regardless of selection order.                               |
| Extraction               | Native thumbnail checkboxes, range input (`1–3, 5`), Select all, Clear selection and a live selection count. Duplicates in human ranges are deduplicated; invalid ranges retain the prior selection with an actionable error.                  |
| Splitting                | Native **Split after page N** boundaries, range input, **One page per PDF** and Clear splits. Every active page belongs to exactly one section. A single-page document explains why splitting is unavailable.                                  |
| Preview                  | Every output lists its filename, page count and ordered current-page range. Expand its preview to see each page with current rotation and additions, labeled with output and document positions.                                               |
| File naming              | Sanitize and bound the original filename, then append page ranges and zero-padded part numbers, e.g. `synthetic-pages-part-02-pages-3-4.pdf`.                                                                                                  |
| Writing                  | Extend the existing processing worker with `extract`; both experiences use the same writer and `exportQuickSign` verification path. No additional parser, dependency, server or PDF service.                                                   |
| Independent documents    | Apply the selected plan and existing artwork through the established writer, then copy only the selected page graph into a new pdf-lib context. Preserve reviewed metadata/catalog values. Do not serialize detached unselected page objects.  |
| Session preservation     | Preparing/downloading copies never commits edits, changes page order or marks a complete editing revision as downloaded. The original document, Undo/Redo and unsaved-work warning remain available.                                           |
| Failure and cancellation | Prepare sections sequentially. Keep ready files if a later section fails; retry only missing sections. Cancel stops the active operation. Changing choices invalidates prepared copies. Mode exit/unmount aborts work and revokes object URLs. |
| Download handoff         | Each prepared file has a separate explicit Download button. No automatic multi-download burst. Report browser handoff and unconfirmed device saving; retain the copy for retry even after a request.                                           |
| Bounds                   | Retain existing 10 MiB input, 50-page, 100-mark, 30 MiB per-output and processing/render deadlines. Prepared copies have an aggregate 60 MiB serialized-byte limit; this is not an OS memory ceiling.                                          |

Relevant paths:

- [Output plans and compatibility messages](../apps/web/src/lib/pdf-tools-page-outputs.ts).
- [Preparation, cancellation, URLs and downloads](../apps/web/src/lib/use-pdf-tools-page-outputs.ts).
- [Selection, boundaries and previews](../apps/web/src/components/pdf-tools-v2/page-outputs.tsx)
  within [Organize pages](../apps/web/src/components/pdf-tools-v2/organize-pages.tsx).
- [Existing writer and structural inspection](../apps/web/src/lib/pdf-tools-engine.ts),
  [worker](../apps/web/src/lib/pdf-tools.worker.ts) and
  [bounded output reopening/rendering](../apps/web/src/lib/pdf-tools-quick-export.ts).

Reviewed the installed official Next 16.4 client-component guide and pdf-lib
1.17.1 `PDFDocument.copyPages`, `PDFObjectCopier` and `PDFPageLeaf` sources.
The copier follows resource references recursively, materializes inheritable
page attributes and removes the donor page's Parent reference. Copying pages
alone does not reconcile document-level AcroForms, destinations or tag trees.
The compatibility gate below is therefore required before copying. See the
[installed copier](../apps/web/node_modules/pdf-lib/src/core/PDFObjectCopier.ts)
and [document implementation](../apps/web/node_modules/pdf-lib/src/api/PDFDocument.ts).
No installed library or framework version was changed.

## Document integrity boundary

| Structure                                                                                                                                                                      | Extract / split behavior                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plain unsigned native text, images and existing visual-signature artwork                                                                                                       | Supported. Preserve page content and selected-page order. A visual signature is artwork, not a cryptographic signature.                                                                                      |
| Mixed MediaBox/CropBox geometry, nonzero crop origins, all orthogonal rotations and current organization edits                                                                 | Supported through the existing geometry/rotation contract.                                                                                                                                                   |
| Added text, initials, dates, checkmarks and visual signatures                                                                                                                  | Use the same validated transparent PNG painter and model coordinates as completed export. The worker rejects missing/mismatched artwork rather than silently omitting an addition.                           |
| Supported live form widgets, repeated fields, shared values and field hierarchies                                                                                              | **Copies blocked for the entire document**, even when selecting all pages or apparently field-free pages. Existing form editing remains available. No flattening or partial widget/field copying workaround. |
| Existing annotations and links                                                                                                                                                 | **Copies blocked** using the established organization restriction. Do not discard annotations, turn links into inert artwork or leave destinations pointing into another document.                           |
| Bookmarks, destinations/name trees, page labels, logical structure/tags, article threads, calculation order, positional print ranges and other known page-dependent structures | **Copies blocked.** Preserve the source session and direct users to its source application.                                                                                                                  |
| Unreviewed catalog structures, references from copied data to Page/Pages/Catalog objects, dangling references or over-complex graphs                                           | **Copies blocked.** A bounded graph walk examines retained page values, inherited resources/geometry, document Info and reviewed catalog entries.                                                            |
| Cryptographic signatures, signature fields, byte ranges, certification/permission markers and modification constraints                                                         | Existing intake rejection. Do not produce altered copies that imply preserved signature validity.                                                                                                            |
| Encryption, unsupported form types, XFA, scripts/actions and attachments excluded by current intake                                                                            | Existing rejection remains; no expansion or bypass.                                                                                                                                                          |

Only reviewed catalog entries can be copied: Metadata, Lang, ViewerPreferences,
PageLayout, PageMode, OutputIntents and Version, alongside document Info. The
existing organization check independently rejects page-dependent contents such
as PrintPageRange. Unknown catalog keys fail closed. Live forms are refused
before any page graph is copied, preventing orphaned widgets, shared-field
relationship loss and field-name collisions. Future form copying needs an
explicit reconciliation design and independent evidence.

Every actual export uses a fresh worker that inspects the original bytes again;
the UI restriction is not the only gate. Validate the selected page plan and
artwork, serialize, reopen with PDF.js, check ordered page count/geometry and
render every output page before exposing its Download button. The original bytes
are neither rewritten nor transferred away from the editing session.

This is extraction, not secure redaction. Shared resources and document metadata
can retain information beyond the selected visible region. No forensic erasure,
PDF/A certification, accessible tagging or universal PDF compatibility is claimed.

## Actual interaction and independent-output results

All twelve page-output browser scenarios pass: six journeys each on desktop and
touch-emulated mobile. Tests use isolated contexts and synthetic documents only,
including static employment pages and an actual ephemeral CMS-signed security
fixture. No personal PDF or current browser workspace is seeded.

| Interaction                         | Actual result on desktop and mobile                                                                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single-page extraction              | Native Space/touch checkbox selection, count, range error retaining selection, valid Enter-applied range, download and direct original/Poppler comparison pass.                                                 |
| Multi-page noncontiguous extraction | Current positions 1–2, 5 appear in the stated output order with edits and rotations; the three-page file passes independent comparison.                                                                         |
| Multiple split boundaries           | Boundaries after 2 and 4 yield three independently downloadable PDFs of 2, 2 and 1 pages. One-page-per-PDF planning and clearing boundaries also work.                                                          |
| Keyboard/touch alternatives         | Native thumbnail/boundary checkboxes work with Space and touch taps; Enter activates the split mode and an output preview. Escape cancels safely.                                                               |
| Partial preparation failure         | An injected second-copy worker failure retains the first file; Prepare remaining PDFs succeeds without losing edits.                                                                                            |
| Failed browser handoff              | An injected anchor-click failure starts no download, explains retry/settings and keeps the file. Retry produces an actual PDF; feedback never claims device saving.                                             |
| Cancellation/stale work             | Cancel an actual held worker request, retry, then change selection: no cancelled/stale copy is exposed and old object URLs are revoked.                                                                         |
| Unsafe structures                   | Forms, links, tags and positional print ranges explain rejection and disable both operations without adding history. Unit cases additionally cover unknown annotations, outlines, labels and broken references. |
| Original document/session           | Repeated inspection hashes equal original bytes. Preparing/downloading adds no history step; Undo reverses the last actual rotation. Failed-copy downloads leave the unsaved-work warning and edits intact.     |
| Narrow layout                       | At 320 × 568 the modal fits horizontally and both preparation controls remain reachable, with scrolling for page choices/previews.                                                                              |

The page-output journey adds text, a typed signature, a date, initials and a
checkmark; moves original page 3 to position 1; rotates it right, original page 1
left and original page 5 right. It downloads a full edited baseline, extracts
current positions **1–2, 5** (original pages **3, 1, 5**) and splits after current
pages **2 and 4** into **2 / 2 / 1** page PDFs. Every split output is downloaded
individually. Preparing files must produce zero downloads by itself.

Independent verification uses the already installed Poppler **26.06.0** at
`/nix/store/63r5wi3sdvwalqcdibpipnyl35swdzzg-poppler-utils-26.06.0/bin`, selected
with `PDF_TOOLS_POPPLER_BIN`. No installation is needed. For each real copy:

1. `pdfinfo -box` must open without diagnostics. Structural assertions compare
   each output's MediaBox, CropBox and rotation with its intended source page.
2. `pdftotext -raw -cropbox` must exactly match the intended baseline page.
3. `pdftoppm -r 144 -cropbox -png` independently renders that page and its
   baseline. Dimensions and every RGB pixel must match; this copy comparison
   does not need the rotation-neighborhood tolerance used in Phase 4A.

The full edited baseline is also covered by the existing Phase 2–4A independent
source/artwork comparisons running in the same V2 suite. This separates copying
fidelity from the pre-existing writer's rendering behavior. The single-page
copy is independently compared directly with its untouched original. Unit tests
also enumerate serialized Page objects to reject hidden detached unselected
pages, verify original-byte/edit immutability and reject unsafe references.

| Independent measurement                     | Desktop                                      | Mobile                           |
| ------------------------------------------- | -------------------------------------------- | -------------------------------- |
| Actual copies inspected                     | 5: extracted, three split parts, single page | Same five copies                 |
| Output-page comparisons at 144 dpi          | 9                                            | 9                                |
| Changed RGB pixels                          | **0**                                        | **0**                            |
| Extracted source text                       | Exact match on every copied page             | Exact match on every copied page |
| Page count/order, MediaBox/CropBox/rotation | Preserved                                    | Preserved                        |
| Poppler inspection/render diagnostics       | None                                         | None                             |

The extraction includes a 550 × 780 pt visible cropped A4 page with CropBox
`[20, 30, 570, 810]`, a rotated Letter page and a 400 × 600 pt small page.
The split also includes the other Letter/landscape pages. Pixel dimensions range
from 800 × 1200 to 1584 × 1224 at 144 dpi. The existing organization and editing
regressions additionally exercise every orthogonal source rotation and inherited
page attributes. These results establish the tested subset, not arbitrary-PDF
compatibility.

Actual PDFs and all per-page expected/actual Poppler renders remain under
`v2-native/page-outputs-extracts-…-{desktop,mobile}/` and
`v2-native/page-outputs-one-page-…-{desktop,mobile}/` in the private evidence
directory. See `independent-output-summary.json` for all eighteen pixel
comparisons, and each test's `*-pdfinfo.txt` and `*-pixels.json` for raw results.

Added text and dates retain Phase 3's artwork limitation: they look correct but
are not selectable/searchable PDF text after export. Native source text remains
searchable. Do not infer accessible reading order or tagging from visible text.

## Screenshots

Actual synthetic Chromium captures at desktop 1440 × 1100 CSS pixels, mobile
390 × 664 at device scale 3, and a separate 320 × 568 case. No mockups or real
personal information. Representative wide/narrow extraction, split, ready-copy,
blocked states and independently rendered output were visually inspected for
clipped controls, readable filenames, selection/focus and retained artwork.

| State                                   | Desktop                                                                      | Mobile                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Extraction selection and output order   | [Extract preview](assets/pdf-tools-2-phase-4b/extract-preview-desktop.png)   | [Extract preview](assets/pdf-tools-2-phase-4b/extract-preview-mobile.png)   |
| Visual split boundaries                 | [Split boundaries](assets/pdf-tools-2-phase-4b/split-boundaries-desktop.png) | [Split boundaries](assets/pdf-tools-2-phase-4b/split-boundaries-mobile.png) |
| Independent files and download feedback | [Ready copies](assets/pdf-tools-2-phase-4b/split-ready-desktop.png)          | [Ready copies](assets/pdf-tools-2-phase-4b/split-ready-mobile.png)          |
| Unsupported-structure explanation       | [Blocked copy](assets/pdf-tools-2-phase-4b/unsupported-output-desktop.png)   | [Blocked copy](assets/pdf-tools-2-phase-4b/unsupported-output-mobile.png)   |
| 320px extraction                        | [Narrow extraction](assets/pdf-tools-2-phase-4b/extract-320-desktop.png)     | [Narrow extraction](assets/pdf-tools-2-phase-4b/extract-320-mobile.png)     |
| 320px splitting                         | [Narrow splitting](assets/pdf-tools-2-phase-4b/split-320-desktop.png)        | [Narrow splitting](assets/pdf-tools-2-phase-4b/split-320-mobile.png)        |

Independent extracted page with text, signature, date and original artwork:
[desktop Poppler render](assets/pdf-tools-2-phase-4b/poppler-extracted-page-desktop.png),
[mobile Poppler render](assets/pdf-tools-2-phase-4b/poppler-extracted-page-mobile.png).

## Executed checks

Node 24.21.0, pnpm 11.27.0, Next 16.4.0, pdf-lib 1.17.1, PDF.js 6.4.299,
Playwright 1.64.1 and sandboxed system Chromium. Logs and private generated
PDFs/renders are under `.fats-private/pdf-tools-2-phase-4b-completion/`.

| Result                                           | Command / scope                                                                                                                                                                                                   | Evidence                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| PASS                                             | `pnpm exec vitest run tests/unit/pdf-tools*.test.ts` — 47/47                                                                                                                                                      | `pdf-units.log`                                                 |
| FAIL, separately documented paused matching debt | Offline full suite: `pnpm exec vitest run --no-file-parallelism` — 302 pass, one frozen-hash failure                                                                                                              | `all-units-native.log`                                          |
| PASS                                             | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck --skip-nx-cache` — all four projects execute                                                                                                             | `typecheck-final.log`                                           |
| PASS                                             | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint --skip-nx-cache` — all four projects execute                                                                                                                  | `lint-final.log`                                                |
| PASS                                             | Full V2 browser suite, Poppler enabled — **63 pass, 3 intentional skips**, including all 12 extract/split cases                                                                                                   | `v2-native.log`, `v2-native/`                                   |
| PASS                                             | `DATABASE_URL= BETTER_AUTH_URL= BETTER_AUTH_SECRET= FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build --skip-nx-cache` — fresh build, 24.9 seconds | `build.log`                                                     |
| PASS                                             | Production PDF editor and dev-route boundary regressions — **6/6**                                                                                                                                                | `production.log`, `production/`                                 |
| PASS                                             | `pnpm format:check`, `git diff --check`, `git diff --cached --check` and 520-file preservation audit                                                                                                              | `format-final.log`, `whitespace.log`, `preservation-audit.json` |

The full V2 command uses `FATS_TEST_PORT=3220`,
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false`, the Poppler directory above and
`pnpm exec playwright test --config=playwright.pdf-v2.config.ts --output=.fats-private/pdf-tools-2-phase-4b-completion/v2-native`.
The existing config explicitly clears database/auth/provider settings and disables
AI. The native unit command sets `FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= FATS_EVAL_LIVE=0 FATS_COMPARISON_LIVE=0`.

Production verification runs
`FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3221 NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm exec playwright test tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts --output=.fats-private/pdf-tools-2-phase-4b-completion/production`.
Both desktop/mobile production form/signature/export journeys pass. Both V2 and
the comparison prototype render not-found in production, and production navigation
still targets the original editor. No PDF upload or original-byte change occurs.

The three intentional V2 skips are two mobile-only keyboard-viewport simulations
on desktop and desktop-only drag on mobile; their applicable counterparts pass.
The full run completes in 7.9 minutes with no failures. Instrumented page-output
journeys report no unhandled page/console errors or unexpected API mutations.
The two existing dynamic-filesystem tracing warnings at unchanged
`apps/web/src/server/document-scanner.ts:40–41` remain in the successful build,
as documented in earlier phases. No scanner repair is included.

The first restricted browser attempt stopped before any journey because the
test server could not start. A direct diagnostic confirmed
`listen EPERM: operation not permitted 127.0.0.1:3220`; see
`server-diagnostic.log`. The scoped native run permits the loopback test server
and retains Chromium sandboxing. The offline full unit suite uses the existing
local systemd document-isolation runner. No browser/system configuration,
parser isolation or security limit was weakened.

## Separate paused AI matching regression

The sole full-unit failure is
`tests/unit/matching-comparison-plan.test.ts:39`. The frozen plan expects the
SHA-256 of `apps/web/src/server/resume-extraction.ts` to be
`23dd7d8ab99e4ab156686f9cb340b7a2d709a581f9d4b4acb8d2fa3417872bcb`.
The actual source and HEAD both hash to
`f6792e8725904e8021749c3a2ba2303ebaf0775ba378d9c3c52bbb6c27da8973`.
The assertion file also matches HEAD, as recorded in `matching-baseline.json`.

This reproduces the exact regression documented before Phase 4B in Phases 2,
3 and 4A. It is unrelated to PDF copying. The other two tests in that file pass;
the historical transient `extraction_failed` assertion does not recur in this
run. No matching implementation, frozen expectation or provider setting is
changed, and no AI request or live evaluation is made. The full suite is not
reported green.

## Limitations and Phase 4C readiness

The scoped engineering checks pass, supporting Phase 4C planning. The supported
boundary is plain unsigned documents and visual additions. Extract/split of live forms, annotations,
links, tags, destinations or unreviewed document structures stays unavailable
until preservation can be established. This restriction is visible and applies
in the worker, even if some isolated copies might theoretically be safe.

Physical iOS Safari/Android Chrome, real browser download restrictions/device
storage, software keyboards/IME, spoken VoiceOver/TalkBack/desktop screen readers,
other browser engines, participant usability and pathological memory stress are
**NOT RUN**. Keyboard controls, native checkboxes, touch emulation and responsive
screenshots are useful evidence but do not establish device usability or WCAG
conformance. The applicable manual checklist remains unpassed. Review actual
downloaded copies before sharing.

Phase 4C requires its own scope and compatibility decisions; this report does not
authorize merging documents or a production release. Any future cross-document
work must separately reconcile ownership, field hierarchies/names, widgets,
destinations/links, tags and metadata, with original-source and independent
export evidence. Selectable added text remains a separate pre-release remediation
recommended in Phase 4A.

Processing and prepared copies remain browser-only and memory-only. Leaving the
output workspace releases copies; leaving the document loses the session. No
server upload, Career Vault save, AI request, ClamAV/model installation, external
PDF service, merge feature, deployment, publication, commit or push is included.
