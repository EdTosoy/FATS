# PDF Tools MVP

PDF Tools is a small, local form-completion workspace at `/resumes/pdf-tools`, linked from **Resumes & documents** for guests and accounts. It is independent of the private document library. Open a local unsigned PDF, complete supported fields, place personal marks, and download a completed copy. Opening or downloading never applies for a job or sends a file to an employer.

## Using the editor

1. Choose a local PDF. The original remains unchanged.
2. Navigate pages with Previous/Next or the page selector. Fit page and zoom work on desktop and narrow screens; the preview can scroll.
3. Expand **Fill the form** for standard single-line text, checkbox, dropdown, and radio-choice fields. Read-only fields remain read-only. **Apply fields to preview** shows changes; downloading always uses current values.
4. Add text, a date, a checkmark, or a personal signature. New marks appear near the top left of the current page. Select a mark, drag it, or edit its Left/Top/Width/Height controls. Arrow keys nudge one page point; Shift moves ten. A page selector moves a mark to another page. Remove, Undo, and Redo cover fields and added marks (50 history steps).
5. For a signature, type a name in the local italic serif style or draw with a pointer. Inspect the preview before placing. Drawing has a typed alternative for keyboard users. Signature drafts clear after placement/cancellation; there is no signature library.
6. Download the completed PDF and inspect every page before sharing. The status identifies changes that have not been downloaded. Closing an edited file requires a discard choice; browser unload protection warns for outstanding changes. Drafts last only in the mounted tab and are not backups.

The export flattens form appearances and added marks. Added text and signature marks can be edited while the original editor remains open; a downloaded/reopened copy contains their finished appearances. There is no OCR, original paragraph editing, redaction, page rotation/reordering/removal, certified signing, or Career Vault implementation.

## Architecture and dependencies

No dependencies were added. The editor reuses pinned **pdf-lib 1.17.1**, **PDF.js/pdfjs-dist 6.4.299**, React, native controls, Radix dialogs, and existing FATS V3 colors/components.

- `pdf-tools-model.ts`: bounded edit history, page-coordinate conversion, file checks and limits; no browser persistence.
- `pdf-tools-engine.ts` and `pdf-tools.worker.ts`: pdf-lib inspection/modification in a dedicated browser worker. The worker retains an original in-memory byte copy. Every preview/export reloads a separate copy and rebuilds from the current edit snapshot, preventing cumulative duplication or original mutation. Fixed messages suppress parser diagnostics that could contain document text.
- `pdf-tools-client.ts`: request correlation, worker failure handling, 15-second operation deadline and termination on timeout/close/unmount.
- `pdf-tools-page.tsx`: PDF.js pixel rendering, local bundled worker, no annotation HTML/link/scripting/XFA layers, font-face loading or WebAssembly. One page canvas is mounted at a time. Each newly selected page/preview gets a fresh render task; cancelled tasks and worker documents are destroyed.
- `pdf-tools-marks.tsx`: one transparent-canvas painter supplies on-page marks and exported PNG bytes, so local system-font glyphs (including typed signatures) match. PNGs are embedded in the PDF, independent of fonts on the recipient’s device. Form fields use pdf-lib's native appearance generation and are flattened for consistent viewing.
- `pdf-tools.tsx`: file selection, field/mark controls, signature draft, navigation, undo/redo and Blob download. No document provider, upload API, server action, database, localStorage, sessionStorage or IndexedDB participates.

Positions are measured in points in the visible page at scale 1, from its top left. Export uses the inverse PDF.js viewport mapping with the effective MediaBox/CropBox intersection, nonzero crop origin, and existing 0/90/180/270-degree rotation. PNG bottom-left placement plus the page rotation keeps marks upright in the displayed page. CSS zoom/responsive dimensions affect pointer conversion only. Added mark previews are raster appearances; original PDF page content stays in its original PDF representation.

References checked against installed sources: [PDF.js document initialization and viewport options](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [pdf-lib page drawing](https://pdf-lib.js.org/docs/api/classes/pdfpage), [pdf-lib form appearances and flattening](https://pdf-lib.js.org/docs/api/classes/pdfform). Installed Next 16.4 client-component/lazy-loading guides informed the route/worker split.

## Supported subset and limits

| Boundary          | Limit                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input             | Nonempty PDF 1.0–1.7, at most 10 MiB; extension plus actual signature/structure checks                                                                               |
| Pages             | 1–50; sides 72–2400 points; existing orthogonal rotation; UserUnit 1                                                                                                 |
| Structure         | 100,000 object visits; no scripts/actions, embedded files, XFA or existing digital signatures                                                                        |
| Fields            | 150; single-line text up to the field maximum or 500 characters, whichever is smaller; checkbox, single dropdown/radio choice; 100 options/200 characters per option |
| Marks             | 100 per document; added text up to 500 characters, initial typed signature up to 100                                                                                 |
| Drawing           | 30 strokes, 1,000 points per stroke                                                                                                                                  |
| Rendering         | 4 million pixels per canvas/image; one visible page; no remote font/resources                                                                                        |
| Added PNG         | Up to 3× point dimensions, capped at 1200×600 pixels; 16 MiB combined encoded bytes                                                                                  |
| Processing/export | 15 seconds per worker operation/render; 30 MiB completed PDF                                                                                                         |

Password-protected/encrypted PDFs, PDF 2.0, malformed/incomplete files, unusual page units/sizes, multiline/password/file-selector fields, editable/multiple-choice dropdowns, option lists, button fields, XFA and existing digital signatures are unsupported. The editor refuses these with actionable messages rather than claiming a successful conversion. Standard form text uses pdf-lib's Western European font encoding; unsupported characters produce an error preserving edits. **Add text** uses local system glyphs and can be used for other characters supported on the device.

Image-only pages show explicit scan guidance: marks can be placed over the image, but its existing text is not editable or recognized. Complex fonts, image encodings, malformed appearance streams and browser differences may fail rendering. Limits and browser workers reduce exposure and resource use; they are not malware scanning, OS memory isolation or proof against malicious PDFs. Users should choose files they trust. Downloads require a successfully rendered current page, but do not certify every page; review the entire output. Very complex documents and other PDF viewers need separate evaluation.

## Signature and security boundaries

A personal signature mark is a visual mark. It is **not a cryptographically verified digital signature**, identity verification, legal certification, a signing audit trail, or a promise of employer acceptance. Existing signed files are refused because rewriting would invalidate their signatures. Ask the recipient which method it accepts. No mark is deliberately persisted for reuse; downloads necessarily contain the marks. Closing clears application references/terminates workers, without a claim of secure RAM erasure or deletion of downloaded files.

The local editor never calls intake or trusted storage. It creates no account document/version, submitted-version association, acceptance receipt, shared link or backup entry. It does not open accepted/quarantined server versions directly. Browser requests for application code/session/workspace data remain the existing shell behavior; selected PDF bytes, values and marks are never included in them.

Hardening 2 remains partial: live ClamAV scanning is unverified. The existing production intake still requires operational scanning, private quarantine, isolated validation, exclusive promotion and accepted-hash evidence. Ownership/session checks, preview/download denial for quarantined/legacy objects, immutable versions and recovery remain untouched. There is no save-to-library control or development scanner bypass. See [Documents](DOCUMENTS.md) and [Hardening 2 verification](PRIVATE_BETA_HARDENING_2_VERIFICATION.md).

## Future Career Vault integration points

Career Vault is not implemented. A later authorized milestone could offer an explicit **Open accepted version locally** action through the existing live-owner, exact-hash accepted download boundary. Keep source version provenance immutable. An explicit **Save completed copy** would submit new bytes through the existing secure intake pipeline and create a new version only after successful scanning/validation; never overwrite or automatically change a submitted version. Keep this action unavailable until required live scanning has been verified. Any future draft/signature reuse, storage retention or cross-device behavior needs separate product and privacy requirements.

Executed evidence and gaps: [PDF Tools verification](PDF_TOOLS_VERIFICATION.md).
