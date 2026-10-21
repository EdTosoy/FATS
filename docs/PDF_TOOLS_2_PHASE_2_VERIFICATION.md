# PDF Tools 2.0 — Quick Sign Phase 2 verification

21 October 2026. **Final engineering verification passed; ready for Phase 3 engineering. Keep V2 development-only.**
The production entry remains `/resumes/pdf-tools`. The candidate is at
`/dev/pdf-tools-v2` under `next dev`; the synthetic design comparison remains at
`/design/pdf-tools`. Both development routes render not-found in production.

## Final verification and Phase 3 decision

**Recommend starting Phase 3: Text, Forms, Dates, Initials and Checkmarks.**
Representative Quick Sign output now passes independent Poppler inspection and
rendering, and the discovered form-widget overlap defect is repaired. This is an
engineering handoff, not production release approval. Physical-device and spoken
assistive-technology checks remain release requirements. No Phase 3 feature was
implemented in this verification milestone.

### Independent PDF verification

Poppler **26.06.0** was already installed at
`/nix/store/63r5wi3sdvwalqcdibpipnyl35swdzzg-poppler-utils-26.06.0/bin`.
It was absent from `PATH`; the earlier availability result below is superseded.
No system package or project dependency was installed. Tests select this existing
directory with `PDF_TOOLS_POPPLER_BIN`; without it the independent check is
explicitly annotated NOT RUN, and the independent security-fixture test is skipped.

The final runs generate new PDFs through the real browser/worker/download path.
`pdfinfo -box`, `pdftotext -cropbox -layout`, `pdfimages -list`, and
`pdftoppm -r 144 -cropbox -png` inspect both original and completed bytes. They
exercise Letter, cropped A4, landscape, a small page and an untouched page;
rotations 0/90/180/270; measured Classic/Simple typed signatures; an accented name;
a long full name; and drawn artwork on a blue background. The first mark is
zoomed to 50%, resized and moved before export; previews are captured at 100%.
The separate pointer checks still cover 25/50/100/200% manipulation.

| Independent result                                                            | Desktop       | Mobile        |
| ----------------------------------------------------------------------------- | ------------- | ------------- |
| Valid readable PDFs, page count/order and CropBox/MediaBox/rotation preserved | PASS          | PASS          |
| Existing extracted text, page delimiters and form value unchanged             | Exact match   | Exact match   |
| Mark recall / precision, allowing the test's one-point raster neighborhood    | 1.0 / 1.0     | 1.0 / 1.0     |
| Maximum signature ink-bound discrepancy                                       | 0.5 PDF point | 0.5 PDF point |
| Changed RGB pixels outside the mark boxes plus 3-point margin                 | 0             | 0             |
| Transparent-background changes away from the small ink raster halo            | 0             | 0             |
| Exact RGB differences on the untouched page                                   | 0             | 0             |
| Exported transparency soft masks                                              | One per mark  | One per mark  |

The five-page fixture has four marks; a separate single-page export verifies the
overlap guard and preserved form. Typed artwork uses the same canvas PNG as the
preview, so the independent viewer does not re-encode signature fonts or substitute
their glyphs. Visual review confirms the long full name and both accents in
**María José de la Cruz** are present, readable and unclipped. Excessive names and
unsupported scripts retain the input and disable confirmation in the browser
regression. The wave-shaped drawn fixture retains its proportions and blue
background through its transparent regions. Original bytes remain untouched.

**Viewer differences:** PDF.js preview rasters and Poppler output are not
pixel-identical. At the common 144-dpi comparison size, desktop page 1 has 59,523
baseline pixels differing by more than 32 RGB levels before any mark and 62,623
after signing, out of 1,938,816 pixels. Mobile counts are 24,900 and 27,372.
Source-text rasterization, antialiasing and preview resampling differ visibly at
edges. To separate these viewer differences from export defects, the expected
signature composite is also built on Poppler's own original-page render. All
signature bounds are within 0.5 point there, and unchanged regions are exact.
No missing glyph, clipped long name, order change or unrelated page mutation was
observed in the final fixtures. This remains representative-fixture evidence,
not a universal guarantee for arbitrary PDFs or all viewers.

Evidence, all synthetic and unretouched:

- Offer: [editor preview](assets/pdf-tools-2-phase-2-final/preview-offer.png),
  [Poppler output](assets/pdf-tools-2-phase-2-final/poppler-offer.png).
- Drawn mark on color: [editor preview](assets/pdf-tools-2-phase-2-final/preview-drawn.png),
  [Poppler output](assets/pdf-tools-2-phase-2-final/poppler-drawn.png).
- Poppler: [long name](assets/pdf-tools-2-phase-2-final/poppler-long-name.png),
  [accented name](assets/pdf-tools-2-phase-2-final/poppler-accented.png).

### Defect found and repaired in this final pass

A signature box placed over the existing full-name widget looked correct in the
editor but disappeared completely in Poppler: expected signature ink was present
in the composite, while exported added-ink pixels numbered **zero**. Live PDF form
annotations paint above the page content containing the added signature image.

Inspection now returns finite PDF-space widget rectangles in the existing
document model. Placement, movement and resize reject a signature box intersecting
a live widget, with **Quick Sign cannot cover an existing form field. Choose a
blank area of the page.** The failed edit does not enter history; rejected
placement keeps its pending signature available. The export worker independently
enforces the same geometry check. All four page rotations and nonzero crop origins
are tested. Existing fields/values stay intact. The production editor retains its
existing field-flattening behavior and is not subject to this Quick Sign guard.

This is a conservative box-based restriction, including transparent signature
padding. It avoids changing or flattening the preserved fields. Phase 3 must keep
this restriction until any different field/mark composition has its own matching
preview/export evidence.

Before/after evidence:
[misleading preview](assets/pdf-tools-2-phase-2-final/overlap-preview-before.png),
[hidden ink in Poppler](assets/pdf-tools-2-phase-2-final/overlap-poppler-before.png),
[rejected placement with retained work](assets/pdf-tools-2-phase-2-final/overlap-blocked.png).
The failing-before-fix trace and objective measurements remain in
`.fats-private/pdf-tools-2-phase-2-final/overlap-before-fix/`.

### Final regression and check results

The full post-repair V2 run passed **23 checks, with one intentional desktop skip**
for the mobile-only keyboard simulation. Four additional focused checks passed
after strengthening transparency assertions and adding the colored background.
They cover:

- Rejected empty/wrong-extension replacement retains signatures and the unsaved
  warning. Valid replacement can be canceled with Keep editing; explicit discard
  loads the new file with clean history and no old marks.
- Export failure retains marks and functional Undo/Redo; retry generates a real
  completed copy. Undo/Redo also survives navigation across several pages.
- Invalid PDFs fail safely. A genuinely password-encrypted fixture is independently
  rejected by Poppler without its known synthetic password and readable with it;
  V2 refuses it without offering a password bypass.
- A real detached CMS-signed synthetic PDF has a valid whole-document signature
  according to `pdfsig -nocert -no-ocsp`. V2 rejects it, starts no download, and
  its bytes and cryptographic validity remain unchanged afterward. The ephemeral
  self-signed test key is removed; certificate trust or identity is not claimed.
- The original production editor's form/signature/export journeys and production
  exclusion of both development routes pass all six desktop/mobile checks.

Commands and artifacts for this final pass:

| Result                                  | Executed command / scope                                                                                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS                                    | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck --skip-nx-cache` — all four projects actually executed with scoped process permission. An earlier restricted attempt exited 130 without diagnostics; direct web/tool checks and the fresh root retry passed.                   |
| PASS                                    | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint --skip-nx-cache` — all four projects actually executed; changed test helpers also passed a direct ESLint check after the final assertion updates.                                                                                   |
| PASS                                    | The focused PDF/theme Vitest command below — **31/31** after the repair, including rotated-widget intersections and the export-boundary guard.                                                                                                                                          |
| PASS                                    | `FATS_TEST_PORT=3200 pnpm exec playwright test --config=playwright.pdf-v2.config.ts --output=.fats-private/pdf-tools-2-phase-2-final/after-fix` with `PDF_TOOLS_POPPLER_BIN` set to the existing directory above — **23 passed / 1 intentional skip**.                                  |
| PASS                                    | Same environment with `--grep='real Quick Sign exports\|form-widget overlap' --output=.fats-private/pdf-tools-2-phase-2-final/transparency` — **4/4**, including independent colored-background/soft-mask checks.                                                                       |
| PASS                                    | `DATABASE_URL= BETTER_AUTH_URL= BETTER_AUTH_SECRET= FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build --skip-nx-cache` — fresh root production build; the same two unchanged scanner filesystem-tracing warnings remain. |
| PASS                                    | `FATS_TEST_PORT=3201 FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts --output=.fats-private/pdf-tools-2-phase-2-final/production` — **6/6**.                                                                       |
| FAIL, unrelated existing hash assertion | `FATS_EVAL_LIVE=0 FATS_COMPARISON_LIVE=0 pnpm exec vitest run --no-file-parallelism` — **278 passed / 1 failed** before the new widget unit assertion was added; all other existing tests passed. See classification below. The final focused PDF run covers the subsequent repair.     |

No cache-only result is used as evidence for the changed source/tests. Browser and
build runs retain blank database/auth/provider overrides and disabled AI. Local
systemd permission is needed only for the existing document-isolation unit tests.
Chromium sandboxing and document security limits remain enabled. No system
dependency, ClamAV installation, provider call, public exposure, commit or push was
performed. Final whitespace, formatting, gallery hashes and preservation checks
are recorded with this report's local evidence. `pnpm format:check` and
`git diff --check` pass. Nine gallery images pass PNG decoding and source-hash
checks. The final preflight audit preserves 445 existing files byte-for-byte,
including unrelated working changes, the design galleries and all three moodboards;
only the seven intended existing PDF/test/report files changed. Generated Next
declarations were restored to preflight bytes. The command/result summary is
`.fats-private/pdf-tools-2-phase-2-final/final-summary.json`.

### Classification of the two earlier matching-plan failures

**1. Confirmed paused-plan checkpoint regression, unrelated to PDF Tools V2.**
The assertion at `tests/unit/matching-comparison-plan.test.ts:39` expects the frozen
`resume-extraction.ts` SHA-256
`23dd7d8ab99e4ab156686f9cb340b7a2d709a581f9d4b4acb8d2fa3417872bcb`;
the actual source hashes to
`f6792e8725904e8021749c3a2ba2303ebaf0775ba378d9c3c52bbb6c27da8973`.
Both files equal preflight and `HEAD`. The same exact failure was independently
reproduced against untouched `HEAD` in the earlier Phase 2 pass and persists in
this serial run. It is already documented by
[Hardening 2](PRIVATE_BETA_HARDENING_2_VERIFICATION.md),
[Momentum](MOMENTUM.md), and
[theme verification](UI_THEME_REFINEMENT_VERIFICATION.md#existing-failures-and-environmental-limits).
The frozen plan and its authorization/expectations were not rewritten.

**2. Transient extraction failure outside V2; not a second persistent plan mismatch.**
The earlier full parallel run failed `matching-comparison-plan.test.ts:87` with
`prepared.state`: expected **ready**, received **extraction_failed**. The current
entire serial suite passes that exact check, as did isolated current-tree and
untouched-HEAD runs. `prepareCase` maps unsuccessful local extraction to that
state; `extractResume` maps process errors to `limit`, and the shared document
runner has four host slots and bounded time/memory. Earlier Hardening 2/theme/
Momentum evidence records parallel parser-capacity failures and successful serial
reruns, though those appeared in other assertions (`limit`/busy), not this exact
line-87 assertion.

The test, plan, fixture preparation, extraction, validation and process sources
match both preflight and `HEAD`, and this source path does not use the V2 editor
or export worker. This independently supports classifying the failure as outside
PDF Tools V2 and consistent with the documented processing-capacity issue. The
earlier run did not retain the underlying OS diagnostic, so its precise resource
cause is **not proven**. No parser limit, isolation, AI function, frozen fixture or
unrelated assertion was changed. AI matching and live evaluations remain paused.
The full parallel suite is not claimed green.

### Remaining physical-device and accessibility requirements

Before public release, run the applicable
[manual checklist](PDF_TOOLS_2_MANUAL_CHECKLIST.md) on the real Quick Sign candidate
with synthetic files: physical iOS Safari/Android Chrome keyboards and IME,
orientation/browser bars/safe areas, pinch and enlarged text, touch/stylus
cancellation and resize, and VoiceOver/TalkBack plus desktop screen-reader and
keyboard journeys. Verify spoken status/error/overflow announcements, modal focus
restoration, no obscured controls, and signature legibility at actual device
scales. Form/text checklist items also need Phase 3 implementations before their
results can be claimed. These checks, participant usability sessions, other browser
engines and other independent viewers such as MuPDF/Acrobat remain **NOT RUN**.
This milestone adds no accessible PDF reading/tagging, durable drafts or browser
Back-navigation guard. These limits do not block the recommended internal Phase 3
engineering handoff; they continue to block a production replacement claim.

## Earlier Phase 2 implementation pass (historical)

The sections below preserve the previous implementation report. Use the final
verification above for current independent-renderer availability, check results,
matching-failure classification and Phase 3 readiness.

### Scope and architecture

Continued the in-progress Phase 2 implementation on the existing
[Phase 1 foundation](PDF_TOOLS_2_PHASE_1_VERIFICATION.md). Local PDFs now support
typed or drawn signatures, explicit placement, selection, proportional resize,
movement, deletion, undo/redo and real completed-copy downloads. Existing PDF form
fields are view-only in V2; this slice does not replace the full production editor.

| Responsibility             | Implementation                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editing state              | Existing `PdfEdits`, `PdfElement` and bounded `PdfHistory`; the Quick Sign hook owns selection, pending placement, export and handoff state.                                                                |
| Signature creation         | Two measured system-font styles, NFC normalization, explicit unsupported-character/readability errors, and bounded pointer drawing. No name is silently truncated.                                          |
| Preview and export artwork | The shared `pdf-tools-marks.tsx` canvas painter produces both preview and transparent PNGs. Legacy marks retain their painter path.                                                                         |
| Geometry                   | Existing PDF.js viewport mapping and `viewToPdf` contract; CSS zoom and backing resolution remain separate. Move and resize commit one history entry per completed gesture.                                 |
| Export                     | Existing `LocalPdfWorker` and engine gain a signature-only `stamp` action. It preserves existing form fields/values and page content instead of applying the production editor's field-flattening behavior. |
| Output verification        | A fresh worker per export attempt, then bounded PDF.js reopening, page-count/geometry validation and rendering of every completed page before browser handoff.                                              |

Typed names support the declared basic Latin/Latin-1 accented repertoire, with
Draw offered for other characters. Minimum typed size is 18 document points.
Resize preserves aspect ratio and readable type at page edges. The existing
10 MiB input, 50-page, 100-mark, 50-history-entry and 30 MiB output limits remain.
Draw is bounded to 30 strokes and 1,000 points per stroke with visible guidance.

Pointer cancellation discards the gesture draft. Scrolling does not place a
signature. Named page placement, page-signature selection, arrow-key movement,
size/move buttons and numeric geometry controls provide alternatives to dragging.
Move and resize targets remain at least 44 CSS pixels at the tested zooms.
The mobile inspector collapses; VisualViewport handling keeps the signature
dialog usable during the simulated keyboard resize and restores layout on exit.

### Unsaved work and failure recovery

Dirty state compares the current edits with the last revision actually handed to
the browser. Failed export preserves marks and history. Success reports browser
handoff and explicitly leaves device saving unconfirmed. A later edit makes work
outstanding again. Object URLs, export workers and render tasks are released on
completion, cancellation or unmount; documents and signatures are memory-only.

During continuation, a browser regression reproduced a data-loss path: after
confirming replacement with an invalid-extension file, the original signatures
remained visible, but Close bypassed the unsaved-work dialog. The outer workspace
had cleared its dirty reference before the replacement passed validation.

Removed those premature resets. The editor's actual revision and document
lifetime now control that reference. The regression failed before the repair and
passes afterward on desktop and mobile for both wrong-extension and empty files:
the original signatures remain unchanged and Close still offers **Keep editing**.
The original file-selection cancellation behavior and valid close/discard flow
remain intact.

### Executed verification

Node 24.21.0, pnpm 11.27.0, Next 16.4.0, PDF.js 6.4.299, pdf-lib 1.17.1 and
sandboxed system Chromium. Browser contexts used generated synthetic PDFs, blank
database/auth/provider overrides and disabled AI. Loopback browser/build commands
used scoped execution permission after restricted execution returned `EPERM`.
The broad unit suite also required access to its existing local systemd isolation
test processes. No sandbox/security setting was weakened.

| Result | Command / evidence                                                                                                                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS   | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck` — four projects; changed web/quality checks executed, domain/extension cached. Repeated after the regression repair.                                                                                              |
| PASS   | `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint` — four projects, repeated after the regression repair.                                                                                                                                                                 |
| PASS   | `pnpm exec vitest run tests/unit/pdf-tools-quick-sign.test.ts tests/unit/pdf-tools-viewport.test.ts tests/unit/pdf-tools.test.ts tests/unit/pdf-tools-worker.test.ts tests/unit/theme.test.ts` — 30/30.                                                                     |
| PASS   | `FATS_TEST_PORT=3200 pnpm exec playwright test --config=playwright.pdf-v2.config.ts --output=.fats-private/pdf-tools-2-phase-2/resumed` — 15 passed; one intentional desktop skip for the mobile-only keyboard simulation.                                                  |
| PASS   | `FATS_TEST_PORT=3200 pnpm exec playwright test --config=playwright.pdf-v2.config.ts --grep='rejected replacement files\|pointer cancellation' --output=.fats-private/pdf-tools-2-phase-2/replacement-after-fix` — four desktop/mobile checks after the repair.              |
| PASS   | `DATABASE_URL= BETTER_AUTH_URL= BETTER_AUTH_SECRET= FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build` — root Nx production build. Two filesystem-tracing warnings remain in the unchanged document scanner. |
| PASS   | `FATS_TEST_PORT=3201 FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts --output=.fats-private/pdf-tools-2-phase-2/production-resumed` — all six production-editor and development-route boundary checks. |
| FAIL   | `FATS_EVAL_LIVE=0 FATS_COMPARISON_LIVE=0 NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test` — 277 passed, two matching-plan assertions failed; see below.                                                                                                                  |

PASS: `pnpm format:check`, `git diff --check`, six gallery PNG decode/source-hash
checks, and preservation of 80 preflight design/report/screenshot/moodboard files.
Generated Next declarations were restored to their verified preflight bytes after
the build.

The initial full-suite attempt inside the restricted sandbox also failed because
the document-isolation tests could not reach the user systemd bus. With the
required local permission, the remaining failures were in
`tests/unit/matching-comparison-plan.test.ts`:

- Its frozen extraction-source SHA-256 differs from the actual source. Both
  source and plan match `HEAD`; the same assertion fails in an untouched `HEAD`
  snapshot at `/tmp/fats-pdf-head-0pcxd7y4`. This is a confirmed pre-existing
  mismatch, not a PDF Tools change.
- Its fixture extraction returned `extraction_failed` during the full run. That
  check passes in isolated current-tree and `HEAD` runs; its full-run cause is
  unresolved. Both isolated runs finish with two passed tests and only the hash
  assertion failing. This report does not claim the full suite is green.

No frozen plan, matching source, fixture expectation or unrelated test was changed.
The isolated current-tree command was
`FATS_EVAL_LIVE=0 FATS_COMPARISON_LIVE=0 pnpm exec vitest run tests/unit/matching-comparison-plan.test.ts`.
The `HEAD` snapshot used the already installed Vitest executable directly, without
installing dependencies. All provider evaluation stayed offline.

### Observable behavior and output evidence

The browser journeys exercise real typed/drawn creation, Latin-1 accents,
long/unsupported-name guidance, pointer/touch cancellation, 25–200% zoom, movement,
proportional resize, one-step undo/redo, keyboard placement, page navigation,
light/dark themes, mobile/320px layouts, export-worker failure and successful retry.
They also retain Phase 1's real inspection/rendering, original-byte equality,
worker lifetime, stale-read cancellation and renderer-failure recovery checks.
The captured desktop, mobile and simulated-keyboard layouts were visually inspected.

Completed PDFs are reopened with pdf-lib for page count, rotations/crops and
existing form values, then with the actual PDF.js renderer for pixel comparison
against the on-page composite. Each desktop/mobile fixture has five mixed-size
pages, four added marks and an untouched page, including all four rotations and
nonzero crop origins. Measured results:

| Measurement                                                                   | Desktop          | Mobile            |
| ----------------------------------------------------------------------------- | ---------------- | ----------------- |
| Mark pixel recall / precision, with the test's one-point raster tolerance     | 1.0 / 1.0        | 1.0 / 1.0         |
| Maximum ink-bound discrepancy                                                 | 1 document point | 0 document points |
| Changed pixels outside expanded mark bounds, above the test's color threshold | 0                | 0                 |
| Exact RGB differences on untouched page                                       | 0                | 0                 |

These are fixture-specific rendering results, not a universal viewer, font or
accessibility guarantee. Requests contain no PDF uploads or external calls, and
the asserted PDF/signature fixture values do not enter local/session storage.
The original byte array remains unchanged. Production-editor form filling,
signatures and export/reopen regressions pass on desktop and mobile too.

Synthetic-only screenshot evidence:

- [Desktop selected signature](assets/pdf-tools-2-phase-2/desktop-signature.png)
- [Mobile selected signature](assets/pdf-tools-2-phase-2/mobile-signature.png)
- [Dark workspace](assets/pdf-tools-2-phase-2/desktop-dark.png)
- [Simulated mobile keyboard viewport](assets/pdf-tools-2-phase-2/mobile-keyboard-simulation.png)
- [Export failure with retained work](assets/pdf-tools-2-phase-2/export-failure.png)
- [Reopened completed page](assets/pdf-tools-2-phase-2/completed-page.png)

Local run artifacts, pixel measurements, the failing-before-fix trace and gallery
source hashes remain under `.fats-private/pdf-tools-2-phase-2/`. A continuation
preflight manifest records the existing working tree. The design prototype,
earlier reports/galleries and all three original moodboards are preserved.

### Remaining release gates

NOT RUN: physical iOS Safari/Android Chrome, real software keyboards/IME/pinch,
spoken screen-reader output, participant usability sessions, other browser engines
or independent PDF viewers, and pathological/maximum-complexity resource stress.
Poppler/MuPDF tools were unavailable locally. The
[manual checklist](PDF_TOOLS_2_MANUAL_CHECKLIST.md) remains unpassed.

Typed names outside the declared repertoire require Draw. Form-field editing,
original text editing/OCR, page organization, certified signing, persistent drafts
and Career Vault handoff remain outside this candidate. Browser Back navigation
has no custom in-app discard guard; native unload protection cannot guarantee
recovery after mobile tab termination. Review downloaded copies before sharing.

No server/storage/quarantine/scanner, account, AI, dependency or lockfile change is
included. Live malware scanning remains unverified. No commit, push, publication,
deployment or production entry-point replacement was performed. Continue toward
the remaining manual/release gates before replacing the production editor.
