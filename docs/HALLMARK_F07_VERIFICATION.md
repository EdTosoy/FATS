# Hallmark F07 — mobile PDF workflow refinement

28 October 2026. Production PDF Tools UX only.

## Preflight and reproduced friction

Read repository/web instructions, the Hallmark audit, decision brief and F07 evidence, [PDF Tools](PDF_TOOLS.md), its [verification](PDF_TOOLS_VERIFICATION.md), relevant independent-renderer verification, and the F08 checkpoint. Used implementation, visual-iteration and verification skills; retained the established React/native-control patterns.

**F07 concerns `/resumes/pdf-tools`.** The audit explicitly names the production editor and its fields/apply/download layout. `/dev/pdf-tools-v2` mounts a separate candidate and calls `notFound()` outside development. No V2 implementation was changed; the production boundary regression passed.

F01, F03 and the Next.js patch are committed (`29bffbc`, `f20a57e`, `34bdf74`). **F02/F04/F06/F08 remain uncommitted.** Preserved those edits, including the existing F08 PDF-storage explanation and F04 CSS. No commits were created.

Current-build synthetic form reproduction passed **4/4 test cases**, covering six theme/viewport combinations: 1440px desktop and 390/360px mobile, light/dark. Mobile CSS put the preview first despite controls appearing earlier in DOM order. At 390px, the first form field started at approximately **1,397px**, the preview at **814px**, and download at **516px**. At 360px these were **1,384 / 840 / 538px**. Reviewing fields required returning upward through distant sections. Two existing full desktop/mobile journeys also produced pre-change reference exports.

## Implementation decisions

- **Edit → review → download.** Remove the mobile preview-first CSS override. Editing now precedes preview in both visual and keyboard order. Undo/Redo sit with editing. The single download action, downloaded/dirty summary and export feedback sit immediately after the preview, inside its existing card.
- **Direct movement, retained context.** A successful explicit **Apply fields to preview** focuses and scrolls to the preview heading. **Review page** moves there without applying anything. **Edit fields and marks**, **Edit selected mark**, and **Back to editing** focus the relevant editing heading or selected-mark region. No new tabs, editor architecture, sticky toolbar or floating document controls.
- **State stays explicit.** Current-page field counts and guidance identify pages without editable fields. Native tool selection, field focus rings and the selected-mark region remain. Pending-preview text is also beside download: the preview may be stale, while downloading still includes current edits, exactly as before. There is no automatic preview update.
- **Feedback and recovery.** Loaded-file failures appear beside download with an alert and programmatic focus. Back to editing retains values/selection. Open-file failures remain near the chooser. Download success and saved-state feedback are adjacent to the action.
- **Touch and desktop.** Editing, review, page-navigation and download controls use 44px minimum heights. Existing design tokens, logo, colors and two-column desktop layout remain. Long forms/placement controls can still scroll; explicit jump actions avoid manually traversing the whole editor to review or continue editing.

Changes are limited to production `pdf-tools.tsx`, scoped PDF CSS and a focused browser test. The worker/client/model/engine, page renderer, mark rasterization and coordinate code are unchanged. Validation, form support/flattening rules, signature placement, zoom mapping, undo/redo, unsaved-work guards and export construction retain their existing implementations. Authentication, server uploads, ownership and scanner gates are untouched.

## Screenshots and mobile interaction results

[Before/after screenshots, PDFs and independent renders](../.fats-private/f07/SCREENSHOTS.md). Captures are unedited, synthetic and Git-ignored. Some full-page captures retain the existing focused skip-link overlay. Both themes were exercised at **390×664 and 360×664**; desktop at 1440×1100.

After captures show fields → preview → download. At 390px, representative positions are **780 / 1,730 / 2,260px**; at 360px, **802 / 1,800 / 2,291px**. These describe the new order, not reduced total page height. The tested apply/review jumps put the preview heading within the first 80px of the viewport without requiring manual scrolling.

Journeys cover form edits, an explicit pending preview, text insertion/editing, selected-mark keyboard nudging, undo/redo, typed and drawn signatures, signature cancellation/focus return, zoom changes, page movement, keep-editing confirmation, download and export reopening. Mobile tests also select a mark with Chromium touch emulation. The new failure journey uses genuinely unsupported form text: preview/export fail, inputs remain, focus reaches the error, correction recovers, and an unapplied corrected value still exports.

Inspected rendered mobile pending/review/download states and independent exported pages. Native labels, focus destinations, dialog Escape behavior, 44px controls and horizontal overflow have browser evidence. **Physical-device and screen-reader testing were NOT RUN. Mobile accessibility is not fully validated.**

## Independent export correctness

Used the existing **Poppler 26.06.0** installation; no installation or dependency change. `pdfinfo -box`, `pdftotext -cropbox -layout` and `pdftoppm -r 144 -cropbox -png` compare the actual pre-/post-change downloads from identical desktop/mobile journeys.

- Both exports retain four pages and identical MediaBox/CropBox/rotation data, including a nonzero crop origin and 0/90/180/270° rotations.
- Extracted form/original text matches the baseline. Both recovered pending-field exports independently contain **“Recovered synthetic graduate.”**
- All **eight page pairs are pixel-identical** at 144 DPI: **zero changed pixels**. This covers text/date/check marks and typed/drawn signatures from the existing complete journey. The existing PDF.js reopen/pixel assertions also pass.
- Independent raster sizes are 1224×1584, 1560×1100, 1584×1224 and 1200×800 pixels. Source-buffer hashes remain unchanged; edited export form fields are flattened under the existing supported-form rules.

Evidence: [comparison](../.fats-private/f07/poppler-results.json), [diagnostics](../.fats-private/f07/poppler-warnings.json), and [widget references](../.fats-private/f07/widget-references.txt).

**Existing structural limitation:** warning-free Poppler validation **FAILS on both baseline and after exports**. All three tools return successfully but report the same five `Invalid XRef entry` diagnostics: 9, 13, 19, 22 and 27. Inspection finds those IDs are original form widgets: flattened exports have no fields, but their page annotation array still retains the removed widget references. The baseline and after diagnostics match exactly; no new warning is accepted by the comparison script. Page/text/raster equality establishes preserved representative output, **not a clean PDF structure or universal reader compatibility**. This existing serialization issue remains for a separate PDF-integrity fix; the F07 layout milestone does not silently change the engine.

## Executed checks

Node 24.21.0, pnpm 11.27.0, Next.js 16.4.1. Isolated local production server on 3198, Chromium sandbox enabled. Synthetic documents only. Request assertions show no POST/PUT/PATCH/DELETE or external HTTP requests during the new complete editing journeys. No account/database/scanner configuration was needed for this local editor work; no AI requests.

| Check                                                     | Actual result                                                                                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck` | **PASS**, four projects. Final test changes also passed tools TypeScript.                                                                                                          |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`      | **PASS**, four projects. Final browser test also passed scoped ESLint.                                                                                                             |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build`     | **PASS**. Existing scanner filesystem-tracing warnings remain.                                                                                                                     |
| Serial unit suite with live AI disabled                   | **FAIL**, **312/313 pass**; only the separate existing matching-plan hash regression. Existing PDF validation/history/worker/geometry/export tests pass.                           |
| Final browser selection                                   | **PASS**, **16/16**: new workflow/recovery, existing PDF journeys, document entry points and production V2 boundary. Mobile theme cases each exercise both 390px and 360px widths. |
| Poppler geometry/text/pixel comparison                    | **PASS**, eight unchanged page pairs; two corrected pending-field exports verified.                                                                                                |
| Warning-free Poppler structure check                      | **FAIL**, matching pre-change/after widget cross-reference diagnostics, documented above.                                                                                          |
| Formatting / diff / moodboards                            | **PASS**, repository Prettier/diff checks and all four preflight moodboard hashes.                                                                                                 |

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test -- --no-file-parallelism
FATS_CLAMAV_DATABASE_DIR= FATS_TEST_PORT=3198 FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/pdf-workflow.spec.ts tests/e2e/pdf-tools.spec.ts tests/e2e/pdf-tools-v2-boundary.spec.ts tests/e2e/document-availability.spec.ts --output=.fats-private/f07/verified
python3 .fats-private/f07/verify-poppler.py
```

Unit execution also cleared live-provider credentials and set matching/evaluation/comparison flags to zero. Raw logs, initial strict Poppler failure and final comparisons remain under `.fats-private/f07/`.

Initial verification corrections: the baseline needed to await the replacement preview canvas after Apply; the corrected baseline passed. An initial new journey used an exact label locator for a select containing option text; it timed out and the run was stopped (five passed, one failed, one interrupted, nine unrun). Corrected it to the existing accessible-combobox pattern; the final selection passed. The initial baseline glob also collected a private historical copy of the complete journey; reference exports used here come from the actual repository test, and the final baseline selection is exact. No product assertion, security gate or validation was disabled to obtain passing results.

## Remaining limitations

The matching plan expects extraction hash `23dd7d8ab99e4ab156686f9cb340b7a2d709a581f9d4b4acb8d2fa3417872bcb`; both `HEAD` and unchanged extraction source hash to `f6792e8725904e8021749c3a2ba2303ebaf0775ba378d9c3c52bbb6c27da8973`. No matching files/expectations changed.

The baseline PDF widget-reference issue remains unresolved. Browser crashes/history navigation still do not provide durable draft recovery; existing guards are not storage. Unusual/unsupported PDFs, other browser engines and readers, real documents, physical touch devices and screen readers remain outside this verification. Secure upload availability remains the separate F08/scanner boundary; no upload path was added.

No commit, push or production deployment. No new PDF capability or V2 change.
