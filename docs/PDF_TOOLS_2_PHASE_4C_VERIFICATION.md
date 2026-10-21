# PDF Tools 2.0 — Phase 4C merge PDFs

22 October 2026. Candidate: `/dev/pdf-tools-v2` under `next dev`.
Existing production editor: `/resumes/pdf-tools`.

**Phase 4C merge engineering verification passes for the supported PDF subset.
Keep V2 development-only.** Users can combine safe local PDFs, arrange their
pages, preview the actual generated copy and download it while preserving their
editing session. Physical-device and spoken accessibility release checks remain
open; the full unit suite retains the separate paused matching-plan regression.

## Preflight and existing work

Read root/web instructions, the V2 design/review and Phase 1–4B verification.
Reused the earlier reports and source investigation where their files were
unchanged. Inspected current staged and unstaged changes. HEAD remains the
Phase 4A merge `b103713` (including `63962e6`); **Phase 4B is uncommitted**.
Its implementation, tests, report, twelve staged screenshots and two additional
Poppler images are the starting baseline. The extra unstaged Phase 4B browser
test changes are preserved too.

The preflight snapshots **523 files**, including all existing UI references,
PDF source/tests, reports and screenshots, under
`.fats-private/pdf-tools-2-phase-4c/preflight/`. SHA-256 hashes and a read-only
snapshot of `git ls-files --stage` preserve both working bytes and staging state.
No reset, stash, overwrite of unrelated work, dependency installation, commit,
push or deployment is part of this milestone.

The final preservation audit retains all **523 baseline files**, with exactly
nine intended existing files extended for merging. All prior reports/galleries,
Phase 4B's extra unstaged test work, dependencies/lockfile, matching files and all
four UI reference images remain intact. Fourteen older gallery captures regenerated
by browser regressions were restored byte-for-byte from the preflight snapshot;
raw regenerated evidence is retained privately. The staged index is unchanged.
See `preservation-audit.json`. New merge source/tests, this report and eighteen
Phase 4C images are additional files.

## Architecture and merge interaction

The journey is **Add PDFs → Arrange pages → Preview → Download combined PDF**.
An empty workspace offers a secondary **Merge PDFs** action to start directly. An existing document uses
**Organize pages → Merge PDFs**. Quick Sign gains no permanent toolbar controls.

| Layer                      | Implementation and decision                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated plan              | `pdf-tools-merge.ts`: source-aware page identities, bounds, movement, duplicate fingerprints, plan validation and filenames. This is a merge plan, not a second editable document model.                                                                       |
| Lifetime and local history | `use-pdf-tools-merge.ts`: sequential imports, validated source renderers, independent bounded Undo/Redo, cancellation, stale-copy invalidation, preparation and browser handoff.                                                                               |
| UI                         | `merge-pdfs.tsx`: source names/counts/thumbnails, selected file/page states, document movement, final page order, removal/Undo, accurate page preview and actual generated-PDF preview.                                                                        |
| Processing                 | Extend the existing `LocalPdfWorker` / `pdf-tools.worker.ts` / `pdf-tools-engine.ts` with `merge`. Use the installed pdf-lib loader, structural inspection and page copier; no second PDF engine.                                                              |
| Shared verification        | Extract the existing completed-download PDF.js reopening/count/geometry/every-page rendering into `pdf-tools-output-verifier.ts`. Quick Sign, extraction/splitting and merging share this contract. Merge retains the verified renderer for its final preview. |
| Entry/boundary             | The existing workspace and organizer host the workflow. The development route guard, production navigation and original production editor remain in place.                                                                                                     |

Each file row shows a persistent **File N**, its name, original page count and
included page count. Identical names are allowed for different bytes; every page
card and preview repeats File N, filename and original page number. Source order
and final page order are explicit. Moving a file groups its included pages in
that file order, preserving their within-file order. Individual moves can then
interleave pages. The interface explains this grouping behavior.

Users can drag file/page handles with insertion feedback, or use named **Move
up/down** buttons. Selecting a page opens its source preview. Removing a page or
file changes only the isolated plan and has local Undo/Redo; no disk file is
deleted. Keyboard shortcuts stop at the merge workflow and do not alter the
editor's history. Removing all pages is allowed while planning, but preparing
requires pages from at least two different PDFs. No blank/duplicate output is
substituted for an incomplete plan.

**Preview combined PDF** produces real bytes, reopens them and checks/renders
every output page. The resulting **Verified combined PDF** preview reads those
exact generated bytes. A labeled native selector reviews the final pages with
source correspondence. **Download combined PDF** then explicitly hands that
checked copy to the browser, using a sanitized `<first-file>-combined.pdf` name.
Preparation itself starts no download. Feedback says download started and leaves
device saving unconfirmed; the same prepared copy remains available for retry.

The installed official Next 16.4 client-component guide and pdf-lib 1.17.1
`PDFDocument.copyPages`, `PDFObjectCopier` and `PDFPageLeaf` sources were inspected.
The copier materializes inherited Resources/MediaBox/CropBox/Rotate, excludes the
donor Parent tree, recursively copies resource graphs and shares one mapping
within each donor. This does not reconcile forms or catalog-level references.
See the [installed copier](../apps/web/node_modules/pdf-lib/src/core/PDFObjectCopier.ts)
and [document implementation](../apps/web/node_modules/pdf-lib/src/api/PDFDocument.ts).
No framework/library version changed.

## Source validation and document integrity

Every file passes the existing extension/size validation and a fresh processing
worker's `inspectLocalPdf`. Merge adds its narrower compatibility check, exact
byte fingerprinting and aggregate limits, then opens/checks/renders every source
page through the existing PDF.js renderer before admission. A rejected input is
identified by filename. A bad second/third source does not clear earlier accepted
inputs; later safe sources in the same selection can still be admitted, with
the rejected file explicitly reported. Repeated selections of the same bytes,
even under another filename, are rejected rather than duplicated silently.

At export, a fresh worker **revalidates every admitted donor** and the complete
plan. It rejects missing/duplicate identities, invalid source indices, duplicate
bytes and limits before copying. One source's page index can never address a
different source's page or marks. All intended output pages must belong to the
plan, and output count/geometry are independently checked in the browser before
Download becomes available.

| Structure                                                                                                                          | Merge behavior                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plain, unsigned, self-contained native text, vector graphics, images and existing visual signatures                                | Supported within existing limits; copy original page content/resources.                                                                                     |
| Mixed dimensions, MediaBox/CropBox, nonzero crop origins, inherited resources/geometry and orthogonal rotations                    | Supported; use actual source page geometry, not CSS rotation or reflow.                                                                                     |
| Existing safely exported FATS text, dates, checks, initials and visual signatures                                                  | Preserved as native page artwork/resources from an explicitly completed copy. No mark reconstruction or hidden replacement with an older editing snapshot.  |
| Live form fields/widgets, including repeated/shared field relationships                                                            | Reject the entire donor. Do not flatten, drop widgets or create conflicting field names.                                                                    |
| Links, annotations, outlines/bookmarks, destinations/name trees, page labels, tags/structure, articles and positional print ranges | Existing conservative copying restriction remains. No dead links, orphaned targets or silently discarded semantics.                                         |
| Unreviewed catalog structures, Page/Pages/Catalog graph references, dangling references or excessive complexity                    | Reject using the established independent-copy gate.                                                                                                         |
| External file specifications, external streams and reference XObjects                                                              | Merge-specific rejection; request a self-contained copy rather than copying unresolved cross-document references.                                           |
| Document-wide OutputIntents or catalog Version overrides                                                                           | Reject merging until a compatible color/version reconciliation path is established. Do not silently lose rendering settings or misstate the output version. |
| Signed PDFs, signature fields, ByteRange, certification/permission/modification constraints                                        | Existing intake rejection. No altered output implying preserved cryptographic signature validity.                                                           |
| Encryption, XFA, unsupported forms, scripts/actions and attachments excluded by existing inspection                                | Existing rejection and resource protections remain.                                                                                                         |

The combined document receives a new neutral title/creator, with no donor author,
document language, XMP conformance claim or donor print configuration. Original
page data is copied; per-donor document metadata is not arbitrarily assigned to
the combined document. The UI explains this metadata policy. Source document
metadata/content is not rewritten. Extraction/splitting retain their own
established metadata-preservation path.

Copying is not secure redaction. Shared resources and per-page metadata may retain
information outside the selected visible crop; no forensic-erasure claim is made.
Added text/dates retain Phase 3's raster-artwork limitation and are not made
searchable or accessible PDF text by merging. Original native text stays native.

## Aggregate resources and stable identity

| Bound                  | Enforcement                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per input              | Existing nonempty PDF 1.0–1.7, 10 MiB maximum, 1–50 pages and accepted geometry/security structures.                                                                                   |
| All retained donors    | **8 files, 20 MiB input bytes, 50 source pages**. Checked before reads where possible, again after inspection, and in the export worker.                                               |
| Removed/undone imports | Retain their original bytes/renderers for local Undo. They continue to consume the aggregate budget. The UI/error explains that leaving/reopening Merge releases them.                 |
| Output                 | Existing **30 MiB** limit; no multiple prepared revisions retained.                                                                                                                    |
| Raster allocation      | Existing four-million-pixel per-canvas cap; source thumbnails fit 110 × 140 at DPR 1 (file thumbnails 40 × 54). Source/output checks render sequentially and clear temporary canvases. |
| Operations/history     | Existing 15-second per-processing/render stage bounds, cancellation and at most 50 plan-history entries.                                                                               |

These are application resource bounds, not an OS heap ceiling for hostile PDFs.
Parsing/font caches and browser overhead are not measured as a universal maximum.
No security or parser isolation limit is relaxed to accept a source.

A page identity is `{ document: <immutable admitted-source ID>, page: <original
zero-based index> }`. Filenames, displayed order and selected positions never
serve as identity. Each import has its own renderer and immutable original bytes;
SHA-256 detects repeated byte-identical sources. Reorder/removal affects only
the ordered references. Undo restores the same references and resources rather
than reparsing a different file. The writer copies only selected donor graphs
into a fresh output context and inserts the copied leaves in final plan order.

## Existing session and failure recovery

The active editor is never implicitly admitted to the merge. The merge workflow
reads only explicitly selected disk files. If the editor has edits/page changes,
its note says **Download its completed PDF first, then add that copy here to
include them**. Existing edits are not passed to an unrelated donor. A completed
copy still has to pass normal per-file and structural restrictions; a live-form
copy remains unsupported for merging.

Closing Merge, changing page-tool mode, cancelling an import/preparation, rejecting
a source or failing export leaves the original document/history untouched. A
previously accepted merge source stays available after a later input fails.
Prepared revisions are revoked when the plan changes; cancellation cannot publish
a stale copy. Leaving releases all retained renderers, workers, URLs and merge
plan state. This is memory-only, with no recovery promise after tab termination.

Worker/export failures retain the plan and offer a real retry. A synchronous
browser handoff failure retains the prepared copy and advises retry/download
settings. Silent browser/OS download blocking cannot be detected reliably; the
UI reports only the handoff request, never successful device saving.

## Independent PDF verification

Synthetic fixtures only. Use the already installed Poppler **26.06.0** via
`PDF_TOOLS_POPPLER_BIN=/nix/store/63r5wi3sdvwalqcdibpipnyl35swdzzg-poppler-utils-26.06.0/bin`.
No system renderer, browser or dependency was installed. Fixtures contain
distinct per-source/page text, shared fonts, opaque four-color raster images,
native visual-signature artwork, Letter/cropped A4/landscape/small pages and all
four rotations. A separate journey uses the actual downloaded completed copy
containing an in-session addition.

The merge tests extend the existing Poppler correspondence helper with explicit
output positions. **Expected renders come directly from each original donor**,
not an expected PDF built using the merge copier. `pdfinfo -box` opens the real
download without diagnostics; structural checks compare MediaBox/CropBox/rotation.
For every selected page, `pdftotext -raw -cropbox` must match its specific donor
page exactly, and `pdftoppm -r 144 -cropbox -png` renders both. Dimensions and all
RGB pixels must match exactly. This checks images/fonts/marks and unaffected
regions, rather than merely accepting a readable output file.

The three-file case has two different PDFs named `same-name.pdf`. File 3 moves
first; original page 3 of File 1 moves ahead of its other pages. Page removal and
file removal are undone. Final correspondence is:

| Output position | Donor                                |
| --------------- | ------------------------------------ |
| 1               | File 3, original page 1              |
| 2–6             | File 1, original pages 3, 1, 2, 4, 5 |
| 7–8             | File 2, original pages 1, 2          |

The desktop/mobile eight-page text/geometry/pixel comparisons pass, with **zero
changed pixels**. Two-file keyboard/touch, empty-workspace file drop and explicit
completed-copy journeys also generate real independent PDFs in the browser.

| Independent measurement                         | Desktop     | Mobile      |
| ----------------------------------------------- | ----------- | ----------- |
| Merged downloads independently inspected        | 4           | 4           |
| Source-to-output pages compared at 144 dpi      | 14          | 14          |
| Changed RGB pixels, including outside additions | **0**       | **0**       |
| Native source text                              | Exact match | Exact match |
| Page counts/order, MediaBox/CropBox/rotation    | Preserved   | Preserved   |
| Poppler warnings/errors                         | None        | None        |

All **28 selected output pages** across eight downloaded PDFs are accounted for.
`independent-merge-summary.json` lists the eighteen donor-comparison groups and
per-page dimensions/results. Actual donor PDFs, combined PDFs, `*-pdfinfo.txt`,
`*-pixels.json` and original/output Poppler PNGs are retained under the four
corresponding `v2-complete/merge-…-{desktop,mobile}/` journeys. Downloads after injected
failures are additionally retained in their retry journey. No missing font, image,
mark, blank page, duplicated page or unexplained pixel change was observed in
these fixtures; this is not universal arbitrary-PDF compatibility evidence.

Unit integration separately checks exact original compressed content streams,
image resources, inherited attributes, new metadata and original-byte/plan
immutability. Signature, certification, field, annotation, cross-page/file,
color/version and invalid-plan rejection are independent worker-engine checks.
The existing full V2 security suite independently validates a real synthetic CMS
signature before/after rejection with Poppler; no certificate-trust claim is made.

## Desktop/mobile and accessibility findings

Actual Chromium screenshots use 1440 × 1100 desktop, the existing 390 × 664 mobile
profile at device scale 3, plus 320 × 568. All data is synthetic. Representative
source ordering, generated preview, unsupported/limit, unsaved-session and narrow
states are visually inspected; final captures are linked below.

| State                             | Desktop                                                                | Mobile                                                                |
| --------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Arranged sources and final order  | [Arranged](assets/pdf-tools-2-phase-4c/arranged-desktop.png)           | [Arranged](assets/pdf-tools-2-phase-4c/arranged-mobile.png)           |
| Actual generated combined preview | [Preview](assets/pdf-tools-2-phase-4c/combined-preview-desktop.png)    | [Preview](assets/pdf-tools-2-phase-4c/combined-preview-mobile.png)    |
| Existing unsaved edits explained  | [Session](assets/pdf-tools-2-phase-4c/unsaved-session-desktop.png)     | [Session](assets/pdf-tools-2-phase-4c/unsaved-session-mobile.png)     |
| Rejected named source             | [Rejection](assets/pdf-tools-2-phase-4c/rejected-source-desktop.png)   | [Rejection](assets/pdf-tools-2-phase-4c/rejected-source-mobile.png)   |
| Aggregate memory/input limit      | [Limit](assets/pdf-tools-2-phase-4c/aggregate-limit-desktop.png)       | [Limit](assets/pdf-tools-2-phase-4c/aggregate-limit-mobile.png)       |
| Empty-workspace start             | [Start](assets/pdf-tools-2-phase-4c/empty-workspace-merge-desktop.png) | [Start](assets/pdf-tools-2-phase-4c/empty-workspace-merge-mobile.png) |
| 320px generated preview/download  | [Narrow](assets/pdf-tools-2-phase-4c/verified-320-desktop.png)         | [Narrow](assets/pdf-tools-2-phase-4c/verified-320-mobile.png)         |

Native labeled controls, pressed selection states, named non-drag alternatives,
44px controls, Radix modal semantics, scoped Undo/Redo shortcuts, status/error
regions and focus restoration are exercised. Focus moves to the actual combined
preview when preparation completes. File/page operations focus surviving selected
controls; closing the empty-workspace modal returns to its launcher. Mobile Merge
keeps Organize/Return and Merge controls visible while removing redundant fixed
description/tabs from the small viewport; other page tools remain under Organize.

The final visual pass also found the generic modal hover style washing out the
primary download button's background while retaining white text. A merge-scoped
hover rule preserves the established primary colors. Actual computed hover text
contrast is **5.68:1** (`rgb(255,255,255)` on `rgb(53,107,150)`) in both browser
profiles, checked in the narrow journey. Mobile download and history buttons use
two predictable rows. This is one verified control state, not a full contrast or
accessibility audit.

Independent output images:
[desktop Poppler page](assets/pdf-tools-2-phase-4c/poppler-combined-page-desktop.png),
[mobile Poppler page](assets/pdf-tools-2-phase-4c/poppler-combined-page-mobile.png).

Browser testing exposed and repaired a preview canvas positioned outside its
paper, intercepting file controls. The first run was interrupted after that
actionability failure; the orphaned exact test server was stopped without touching
other servers. A subsequent run passed 15 cases with one intended mobile skip
and two preview-selector label lookup failures. The selector now has an explicit
label association; the affected eight-page journey passes on both viewports.
Narrow screenshot review prompted compact merge chrome to restore paper space.
No force-click, test skip or weaker output assertion was used to bypass a defect.

Physical iOS Safari/Android Chrome, spoken VoiceOver/TalkBack/desktop screen
readers, real software keyboards/IME, OS downloads/storage, other browser engines,
200% browser-text zoom and participant usability remain **NOT RUN**. Automated
keyboard/touch emulation and screenshots do not establish WCAG conformance or
accessible PDF reading/tagging. Applicable manual release checks remain open.

## Executed checks

Logs and private synthetic PDFs/renders/traces live under
`.fats-private/pdf-tools-2-phase-4c/`. Node 24.21.0, pnpm 11.27.0, Next 16.4.0,
pdf-lib 1.17.1, PDF.js 6.4.299 and Playwright 1.64.1 are unchanged.

| Status                                   | Check                                                                                                                               | Evidence                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| PASS                                     | Focused PDF unit run, 53/53                                                                                                         | `pdf-units-refined.log`; all new external-reference cases additionally execute in the full suite |
| FAIL, separate known matching regression | Offline full unit suite, **308 pass / 1 fail**                                                                                      | `all-units.log`                                                                                  |
| PASS                                     | Uncached root TypeScript; final changed web/quality checks also execute after visual refinement                                     | `typecheck-final.log`, `typecheck-complete.log`                                                  |
| PASS                                     | Final root lint; changed web/quality checks execute                                                                                 | `lint-final.log`, `lint-complete.log`                                                            |
| PASS                                     | Final merge visual/contrast and unchanged Quick Sign retry journeys — 6/6 desktop/mobile                                            | `final-focus.log`, `final-focus/`; earlier focus: `merge-final-focus.log`                        |
| PASS                                     | Final complete V2 suite with Poppler — **80 pass, 4 intentional device-specific skips**, including all 17 applicable merge journeys | `v2-complete.log`, `v2-complete/`                                                                |
| PASS                                     | Fresh production build (Nx cache skipped), then original-editor and dev-route boundary regressions, **6/6**                         | `build.log`, `production.log`, `production/`                                                     |
| PASS                                     | `pnpm format:check`, `git diff --check`, `git diff --cached --check`, 523-file preservation and unchanged staging audit             | `format-final.log`, `whitespace.log`, `preservation-audit.json`                                  |

Exact browser command:

```sh
PDF_TOOLS_POPPLER_BIN=/nix/store/63r5wi3sdvwalqcdibpipnyl35swdzzg-poppler-utils-26.06.0/bin FATS_TEST_PORT=3230 NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm exec playwright test --config=playwright.pdf-v2.config.ts --output=.fats-private/pdf-tools-2-phase-4c/v2-complete
```

The focused command adds `tests/pdf-v2-e2e/merge.spec.ts` and
`--grep='three PDFs|320px'`, writing `merge-final-focus/`. The existing Playwright
config clears database/auth/provider variables and disables AI. Scoped native
execution permits loopback/Chromium subprocesses while keeping Chromium's
sandbox enabled; no browser/system configuration changed.

Root checks use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` with
`pnpm typecheck --skip-nx-cache` and `pnpm lint --skip-nx-cache`. The initial
restricted Nx typecheck exited 130 without diagnostics. Direct web TypeScript
then identified a possibly missing renderer-loading task; an explicit guard was
added, and direct web/tools plus the uncached native root run pass. The full
unit command is `pnpm exec vitest run --no-file-parallelism` with
`FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= FATS_EVAL_LIVE=0 FATS_COMPARISON_LIVE=0`
and the existing local systemd parser-isolation access. No isolation bypass.

Production command:

```sh
FATS_TEST_PRODUCTION=1 FATS_TEST_PORT=3231 NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm exec playwright test tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts --output=.fats-private/pdf-tools-2-phase-4c/production
```

The build uses `DATABASE_URL= BETTER_AUTH_URL= BETTER_AUTH_SECRET= FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY=`
and `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build --skip-nx-cache`.
It passes in 11.0 seconds. The two existing dynamic-filesystem tracing warnings at
unchanged `apps/web/src/server/document-scanner.ts:40–41` remain; no scanner
configuration or unrelated repair is included. All six production checks pass,
including real form/signature/export journeys, original-byte preservation and
both development routes rendering not-found. Production navigation still uses
the original editor.

The final V2 run completes in 9.1 minutes. Its four deliberate skips are the two
mobile-only keyboard-viewport simulations on desktop and the two desktop-only
organization/merge drag cases on mobile. Their applicable counterparts pass.
Instrumented merge journeys observe no unexpected non-read/external requests or
page/console errors. No provider evaluation or account service is required.

### Earlier Quick Sign timing observation

The first complete run (`v2-final/`) recorded 79 passes, four intentional skips and
one desktop Quick Sign retry assertion timeout. At the five-second assertion,
the screenshot still showed preparation busy and the prior history status,
without the expected injected-worker failure alert. The original test, signing
hook and mark painter retain their preflight/HEAD bytes. No signing test,
expectation, timeout or application security limit was changed.

An ignored diagnostic copy records only canvas/worker timing. That same journey
passes, with measured encoding intervals of about 24/22 ms, the injected first
stamp failure, a real successful retry and a valid completed PDF. This is normal
rerun timing, not instrumentation of the earlier failure. The exact earlier
OS/browser scheduling cause is **unproven**. The unchanged original journey then
passes desktop/mobile in `final-focus/` and again in the final full
`v2-complete/` suite (3.9 seconds on each profile). The initial failing trace and
`quicksign-diagnostic/*/export-timing.json` remain available; the earlier full run
is not retroactively labeled green. No further repetition was run after the
complete final suite passed.

## Separate unrelated paused matching-plan regression

The full unit suite reproduces only the already documented failure at
`tests/unit/matching-comparison-plan.test.ts:39`. The frozen extraction-source
hash expects
`23dd7d8ab99e4ab156686f9cb340b7a2d709a581f9d4b4acb8d2fa3417872bcb`,
while `apps/web/src/server/resume-extraction.ts` actually hashes to
`f6792e8725904e8021749c3a2ba2303ebaf0775ba378d9c3c52bbb6c27da8973`.
Both that source and its test retain preflight/HEAD bytes. This exact regression
predates merging and is recorded through Phase 4B. The other two matching-plan
tests pass; the historical transient extraction failure does not recur. No
matching code, frozen assertion or provider configuration is repaired here,
and no AI request/live evaluation is performed. The full unit suite is not green.

## Remaining blockers and scope

The implemented merge slice passes the final full V2 suite and production
regressions. The supported slice is self-contained unsigned PDFs, with explicit
metadata and resource policies. Forms, annotations/links, signatures, unsupported
references and document-level color/version reconciliation remain blocked.
Supporting them requires an independently verified preservation design.

Keep V2 development-only. Complete physical-device and spoken assistive-technology
validation before release; also retain the earlier selectable-added-text,
accessible-PDF and mobile tab-termination limitations. Browser-only memory work
is not durable storage or a signature library. No server uploads, Career Vault
persistence, AI calls, ClamAV installation, external PDF services, certified
e-signature claim, production rollout, deployment, commit or push is included.
