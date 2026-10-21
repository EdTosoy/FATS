# PDF Tools 2.0 — experience design

Final interaction proposal · 20 October 2026 · **Ready for staged engineering; awaiting design approval**

PDF Tools should make the document the workspace. The person should always know
what is selected, what the next click will do, and whether they have a completed
copy. Quick Sign and Edit PDF share one document, coordinate system and history;
they differ in how much interface is visible.

This milestone is an interactive design prototype, not a new PDF editor. The
existing editor at `/resumes/pdf-tools`, its workers, persistence boundaries and
document quarantine remain unchanged. See the [review and evidence](PDF_TOOLS_2_DESIGN_REVIEW.md).

## 1. Design inputs, goals and people

Read the root/web instructions, [design system](DESIGN_SYSTEM.md), current
[PDF Tools behavior and limits](PDF_TOOLS.md), [MVP verification](PDF_TOOLS_VERIFICATION.md),
[theme refinement](UI_THEME_REFINEMENT_VERIFICATION.md), and recent
[product integration review](PRODUCT_INTEGRATION_VERIFICATION.md). Inspected the
committed FATS moodboard and actual integration screenshots, including the existing
PDF workspace. `theme.css` is the current palette authority: the older design
document's light-only assumptions have been superseded by the theme provider.

**Reference limitation:** no DocHub screenshot was attached or found among the
task's repository assets. A reference-specific comparison is pending. Familiar
document-workspace patterns inform this proposal; no DocHub branding, assets or
claims about its particular screenshot are used.

| Person / situation                              | What they need                                                     | Design response                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| First-time graduate, offer received on a laptop | Finish signing without learning an editor                          | Quick Sign, typed signature default, explicit placement, one download action              |
| Graduate completing a multi-page joining form   | Understand what can be edited; preserve progress when moving pages | Supported field highlights, additive text tools, thumbnails, shared undo                  |
| Graduate using a phone or touch device          | Accurate placement without tiny drag targets                       | Separate placement step, zoom, non-drag positioning, properties tray                      |
| Keyboard or assistive-technology user           | Complete the same tasks without drawing or dragging                | Type alternative, place button, named elements, position/size controls, focus restoration |

Priorities: obvious first action; space for the page; direct manipulation with
precise alternatives; clear visual feedback; local privacy; honest errors.
No automatic signing, employer sending, OCR, original-paragraph editing, AI,
signature certification or server saving is proposed for this engineering scope.

## 2. Key journeys

### Quick Sign

1. **Open.** The production design offers **Open a PDF** with limits stated
   beneath it. File-picker cancellation changes nothing. The prototype instead
   offers **Open sample offer**; it does not expose a real file input.
2. **Orient.** The document appears in Fit page, page 1 selected. Quick Sign
   shows Select, Signature and Date. A brief line explains the next step. There
   is no fields panel competing with the offer.
3. **Create.** The guided **Create signature** action (or the Signature tool)
   opens a focused dialog. Type is the default; enter a name and inspect a white-paper preview. Draw is a single alternative.
   Two local typographic choices illustrate restrained style selection. **Use
   signature** is disabled for an empty draft. Cancel/Escape returns focus to
   the opening action and clears the unplaced draft.
4. **Place.** Use signature closes the dialog into placement mode. The pointer
   becomes a crosshair; the instruction says exactly what the next click does.
   Click/tap once to center the mark there. In this synthetic offer only,
   **Place on signature line** is a keyboard/touch alternative at a known sample
   location. This is not automatic signature-field detection. An arbitrary real
   PDF must use **Place on page**, followed by adjustment, unless a supported
   signature target is explicitly identified in a later approved implementation.
5. **Adjust.** The placed signature is selected. Drag the mark, resize its
   lower-right corner with proportions locked, nudge with keys, use the simple
   Smaller/Larger controls, or expand **Advanced** for page-point geometry. The entire gesture creates one history entry. Clicking outside
   deselects; the signature remains. Changing tools never silently stamps a mark.
6. **Date if needed.** Choose Date, place it, then edit its value. Production
   should expose a native date input, show the chosen format and require the
   user to confirm the date. The prototype uses the fixed synthetic date
   **20 Oct 2026** and an editable date-text property.
7. **Download.** Download opens a compact review with filename, pages and mark
   count. Review the pages, then download a copy. Show preparation, success or
   retryable failure. The prototype uses **Preview download**, ending with
   **Preview complete**, an explicit no-file/no-save explanation and **Keep editing**. It creates no
   file and leaves edits unsaved.

Action budget after a file is already open: Signature → focus/name entry → Use
signature → placement → Download → confirm. This is six discrete interactions
when field activation counts as one and typing counts as the same entry action;
seven if focusing and typing are counted separately. Opening adds one file-picker
activation plus OS selection. Optional style, date and adjustment actions are
counted separately. This is a proposed path, not measured participant performance.

### Edit PDF

1. Open a form or switch modes without reopening the document. Both workflows
   retain the same fields, marks, pages and undo history. Switching modes cancels
   unplaced marks; it does not delete placed content.
2. Click a highlighted supported field and type directly. Plain document text
   never receives a misleading text-edit affordance. Commit on blur/Enter;
   native editing shortcuts work inside the input. The prototype demonstrates
   three single-line fields; production must preserve the current supported
   checkbox/dropdown/radio subset and its read-only/validation behavior.
3. For a noninteractive area, choose Text, click a location, and enter content
   in its contextual property field. New text opens its editing controls; existing
   phone selections offer Edit/Done. Double-click an added text mark to focus
   that field. Enter/blur commits; changing text must not place a second mark.
4. Change size, weight or ink in Properties. Production v1 keeps one body-text
   font and explicit size choices; a large font menu is unnecessary for forms.
   Signature style is separate from body-text properties.
5. Insert initials, dates or checkmarks through the same choose → place → adjust
   pattern. Placement is single use: after placement, return to Select. Repeated
   stamping must be explicitly requested in a later milestone.
6. Navigate by thumbnail, Previous/Next or page selector. Pending placement
   follows the current page and remains clearly announced. Selection clears on
   page change. Commit a field before leaving its page. Use thumbnail selection
   and undoable Move up/Move down/Remove under Organize pages.
7. Review all pages and download. No action applies to a job, accepts employment,
   sends a message, attaches to Career Vault or saves to the library.

## 3. Proposed workspace layout

| Region              | Content and behavior                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document header     | Exit, FATS mark, compact product label, editable document title, local-only status, appearance selector, guide and primary Download                                                                              |
| Workflow/tool strip | Quick Sign / Edit PDF; tools grouped next; Undo/Redo at the far end. Explicit pressed state, title and accessible name                                                                                           |
| Signing guide       | Three-step Create → Place → Download guidance below the stage, with one next action; Edit PDF shows it only during placement                                                                                     |
| Left rail           | Page thumbnails, current-page number/name, separate Organize pages disclosure. Collapsible on desktop; modal page chooser on mobile                                                                              |
| View controls       | Previous/current/next, Fit page/Fit width, zoom minus/plus and percentage. View changes never modify document content                                                                                            |
| Canvas              | Neutral stage, centered white paper, modest shadow and a page caption. Paper/ink stay invariant across appearance themes                                                                                         |
| Properties          | Appears only for a selected element: text/date/name, text size/weight, ink and simple signature sizing. Geometry is under Advanced. Desktop side panel; collapsed Edit summary/scrollable editing tray on mobile |
| Status line         | One live announcement, unsaved/memory-only state, restart control for design review only                                                                                                                         |

The prototype uses the existing local font stack, semantic action/surface/focus
tokens and 4px spacing rhythm. It adds only document-fixture colors for the
fictional printed letter and its marks. There are no remote fonts, decorative
gradients, dashboard cards around the document, new libraries or template assets.

The desktop thumbnail rail is 124px with 84px previews; properties are 248px
(228px on tablet). The compact header and workflow row are the only full-width
top bands. View controls share the canvas background and reviewer controls live
in the footer. Below 760px, workflow/history stay at the top and labeled tools
move to a bottom dock. Thumbnails use a dialog. The mobile properties summary
expands on Edit and collapses on Done, which returns focus to the selected mark.
New text/date placement opens controls directly. Expanded properties replace the
dock/signing guide and occupy layout space instead of covering the paper. The
stage scrolls independently and reveals the selection when tray size changes.
The header Download remains named when its visible label becomes an icon.
Exact breakpoints and physical keyboard behavior remain subject to user testing.

## 4. Interaction contract

### Selection, pointer placement and resizing

| Input                              | Result                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click tool                         | Cancel previous unplaced mark; make the selected tool explicit                                                                                            |
| Click page while a mark is pending | Place once, bounded to the visible page coordinate system; select the new mark; return to Select                                                          |
| Click existing mark                | Select without moving; show border, handles and matching properties                                                                                       |
| Drag selected mark                 | Capture pointer, preview bounded movement, commit once on release; pointer cancellation restores original geometry                                        |
| Drag resize corner                 | Preview the same origin with new dimensions; signature/initials preserve aspect ratio; commit once                                                        |
| Click blank page / Escape          | Deselect; Escape also cancels pending placement. Placed content remains                                                                                   |
| Delete selected mark               | Remove only that mark; Undo restores it; ordinary text Backspace is unaffected                                                                            |
| Edit property                      | Commit on blur/Enter for text/numbers, immediately for explicit select/radio actions. Empty text is visible as an empty selection until filled or deleted |
| Change page                        | Commit field draft, clear selection, reset canvas scroll; preserve document state and pending tool                                                        |
| Undo / Redo                        | Restore content, fields and page order together; a fresh edit clears redo. View/theme changes do not enter history                                        |

Handles must remain discoverable at every zoom. The refined prototype shows only
its working lower-right resize corner, with a 44px screen-space hit area independent
of document zoom. Supported form fields still need separate touch-target work.
Resize geometry must be updated from the original gesture, never accumulated from render deltas.
Precision is measured in document points, independent of CSS scale and display
pixel ratio. Real PDF crop/rotation transforms remain an engineering requirement;
the HTML prototype does not validate them.

### Keyboard and focus

- Tab/Shift+Tab traverse named controls and document marks. No custom keyboard
  trap outside dialogs. Native selects use platform keys.
- Page contents lists editor fields and added marks by name, separate from printed
  PDF reading. The skip link reaches document controls. Enter on a mark opens its
  properties; deletion moves focus to Page contents.
- Enter/Space activates tools and place buttons. An explicit placement action
  gives a non-drag path; position/size fields offer a precise alternative.
- Focused mark: arrows move 1 point; Shift+arrows move 10; Delete removes.
  Focused resize handle: Left/Right changes width by 5 points, preserving the
  signature ratio. The geometry inputs remain the general keyboard alternative.
- Ctrl/Command+Z undoes; Ctrl/Command+Shift+Z and Ctrl/Command+Y redo. These
  shortcuts do not intercept active text inputs or dialog input editing.
- Dialogs use existing Radix semantics, title/description, containment, Escape
  and focus restoration. Signature confirmation moves focus to the placement
  action; placement moves focus to the new mark. Destructive confirmation defaults
  to keeping work.
- Status announcements describe outcomes without announcing every pointer pixel.
  Selection labels include kind and content. Thumbnails announce page name/number
  and current-page state.

### Touch, zoom and page organization

Tap tools, then use Place on page or tap once to place. Mark artwork and stored
geometry stay in document coordinates, while move and resize hit regions have
at least 44×44 CSS-pixel screen targets at each PDF zoom. The only resize handle
is offset from the move target with a visible connector. Drag from a mark to move
it; scroll from empty page/stage space to reposition the view without clearing
selection. Pointer cancellation restores original geometry. Named movement
buttons, keyboard arrows, the resize handle keys and Advanced remain alternatives.

At 50% PDF zoom and above, native supported-field hit regions are at least 44px
high. At lower overview scales, use the grouped field picker to avoid overlapping
expanded inputs. Page contents always lists supported fields and added marks by
name/value, including overlapping marks, and opens the selected properties without
visual coordinates. The picker exposes editor objects; it is not a PDF reading or
tagging interface. Page selectors and navigation use 44px controls; at very narrow
widths native zoom selection retains every 25–200% choice.

On phones, VisualViewport height and offset keep the editor above a software
keyboard when that viewport differs from the layout viewport. Pinch scale is not
classified as a keyboard. With limited editing space, retain the selected page
object, active full-size input and sticky Done control, and hide secondary chrome.
Text drafts update the page live and commit on blur/Enter. Done collapses the
properties summary and restores focus; keyboard dismissal restores the normal
layout without changing PDF zoom. Scroll the stage independently while preserving
selection and draft. A focused numeric input must remain visible as well as a
text value. Browser keyboard/viewport simulations establish this contract only;
physical iOS/Android keyboards, IME composition, browser chrome, pinch/text zoom,
stylus and spoken screen-reader behavior remain release-validation requirements.

Fit page considers available width/height. Fit width preserves horizontal page
coverage and permits vertical scrolling. Zoom steps are bounded to 25–200% in the
prototype; percentages and placement geometry must agree. At high zoom, the stage
scrolls rather than forcing the app to overflow horizontally. Production zoom
should preserve the point under the viewport center; that anchor refinement is
not simulated here.

Organize pages is secondary, not a default wall of controls. Select a thumbnail,
move it earlier/later, or request removal. Removing a page asks for confirmation,
removes its marks and supported fields, selects a surviving page and is undoable
as one transaction. The final page cannot be removed. Drag reordering and 90°
rotation belong in a later implementation slice after coordinate/export tests;
neither is implied by the prototype's working move buttons.

### Signature quality and lifecycle

Type and Draw retain the same placement and editing outcomes. The typed prototype
measures the actual local Classic (italic) or Simple (upright) font at 32pt,
widens the initial box up to the sample page limit, then fits only down to an
18pt document-size floor. The creation preview scrolls horizontally for long
names and names the limitation. If the name still cannot fit, confirmation is
disabled with an explicit edit/style/Draw alternative; no stored name is silently
truncated. The 18pt floor is a design target, not proof of readability at every
screen zoom or proof of exported PDF glyph fidelity.

Placed typed signatures preserve aspect ratio while resizing. Attempts to shrink
below the readable fit are rejected with a status explanation and restored numeric
value. An edited name that no longer fits remains intact, shows overflow feedback
and a needs-space placeholder, offers sizing/style/name controls, and blocks
simulated download preview until corrected. A wide name needs placement review;
fitting within the page does not establish that it fits an arbitrary signature
line or avoids a date field. Production must measure using the same glyph/font
source as real PDF output and verify diacritics, crop/rotation and exported
baselines before release. The prototype makes no export-quality promise.

Draw keeps its white surface, baseline, clear action and Type alternative.
There is no biometric authentication or certificate badge.

Unplaced drafts clear on cancellation. Placed marks remain editable only in the
open session. No reusable signature library, image upload, cross-device sync or
remember-signature toggle is introduced. A visual mark provides no identity
verification, signing audit trail or certified e-signature. Keep that explanation
short and close to creation and export.

### Export, unsaved changes and recovery

Production Download should name a completed copy, show preparation without
fabricated percent progress, retain all work on failure, allow a safe retry and
announce only what the browser can know: **Download started**, not **File saved to
your device**. Reset the outstanding-download revision only after successful
byte generation and handoff; a later edit makes it outstanding again. Review all
pages, preserve the original, and state flattening before export.

No background autosave is implied. A visible memory-only state must persist.
Navigating away or opening another file with edits asks **Keep editing** or
**Discard and leave/open**. Offer Download from that production confirmation when
it can actually generate a file. Browser refresh/tab close uses the browser's
native warning; exact wording is not controllable, and mobile OS termination can
lose a tab without any prompt. Browser Back navigation needs a separate
implementation decision and verification; the prototype guards its explicit exit,
restart and native unload only.

Simulated export never clears the prototype's dirty state. It must not supply a
placeholder file with a `.pdf` extension or claim that changes were saved.

### Loading, errors and unsupported files

| State                                      | Exact experience                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Empty                                      | One clear open action plus short local/privacy information; no invented user documents. Design route offers only labeled samples                       |
| Opening/rendering                          | Stable workspace, busy indication, descriptive status, disabled conflicting actions. Production has worker timeout/cancel; no fake progress percentage |
| Unsupported structure / existing signature | Explain that safe editing is unavailable; request an unsigned standard copy; never flatten away an existing digital signature                          |
| Password protected                         | Explain that an unlocked copy is needed. No password bypass or recovery UI                                                                             |
| Scanned page                               | Explain that existing text cannot be edited; added marks remain possible if the current engine accepts the document. No OCR claim                      |
| Render failure                             | Preserve edits; retry the affected rendering. Download remains blocked when required preview/render state is unavailable                               |
| Export failure                             | Preserve edits and revision; explain retry without reopening. Do not log PDF text/parser diagnostics                                                   |
| Limit exceeded                             | State the applicable current supported limit and a concrete next step before processing; never accept a partial document silently                      |

The prototype's Review state selector makes empty/loading/unsupported/password/
render-error compositions inspectable. The download dialog has a separate failure
toggle. These are reviewer controls, not production navigation. Returning to
Workspace preserves current sample state.

## 5. Feature priorities and implementation gates

| Priority | Capability                                                                                                              | Gate                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| P0       | Quick Sign flow, focused shell, supported fields, placement, selection, resize, undo, truthful download and dirty state | Approve prototype and interaction spec; retain existing engine limits/security                             |
| P0       | Responsive properties, keyboard placement/geometry, focused announcements, all themes                                   | Keyboard/touch/a11y testing on real devices and assistive technology                                       |
| P1       | Initials/date/checkmark polish, current-page thumbnails, view-state stability                                           | Same-source preview/export and font/coordinate evidence                                                    |
| P1       | Page reordering/removal with combined history                                                                           | Separate model/worker/export review; explicit treatment of form field references and final-page protection |
| P2       | Page rotation, drag reorder, center-anchored zoom, pinch interaction                                                    | Dedicated rotation/crop/zoom and gesture verification                                                      |
| Deferred | Draft persistence, signature reuse, library handoff, original text editing/OCR, certified signing                       | Separate requirements/authorization; never silently expand scope                                           |

## 6. Prototype and screenshots

Run the installed stack from the root:

```sh
DATABASE_URL= BETTER_AUTH_URL= BETTER_AUTH_SECRET= FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= pnpm --filter @fats/web dev --hostname 127.0.0.1 --port 3200
```

Open <http://127.0.0.1:3200/design/pdf-tools> in a separate browser profile.
Stop only your own server. The route returns not-found outside development and
has no production navigation link. It shares the existing FATS theme provider and
shell; ordinary shell session reads can still occur, but sample data never enters
the application repository. No database or Mailpit prerequisite is needed.

Prototype files live in `apps/web/src/components/pdf-tools-design/`; the route is
`apps/web/src/app/design/pdf-tools/page.tsx`. The model is synthetic state,
not a reusable PDF editing abstraction. There is no real input/export,
parser/worker connection or backend persistence.

Screenshot gallery, inspection findings and reproduction commands are in the
[design review](PDF_TOOLS_2_DESIGN_REVIEW.md#prototype-gallery).

## 7. Measurable acceptance criteria

These are **proposed release gates**, not passed usability claims. Run moderated
sessions with at least eight first-time graduates, including at least four using
their own phones and two keyboard-only sessions; recruit assistive-technology
users separately. Report individual outcomes, timings, errors and assistance,
not just aggregate percentages from this small formative sample. Use synthetic
offers/forms and consented observation; no employment documents are necessary.

| Area                    | Proposed measure                                                                                                                                                   | Evidence required                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| First-time signing      | At least 7/8 finish unassisted within 90 seconds from document ready, including locating the output action                                                         | Observed tasks; prototype can assess navigation, real editor needed for actual download |
| Signing actions         | Median ≤6 interactions after open using the counting rule above; record adjustments/dates separately                                                               | Interaction log/video, including misclicks/backtracking                                 |
| Form completion         | At least 7/8 fill three fields, add a mark, visit another page and find Download within 3 minutes without instruction                                              | Participant task outcomes                                                               |
| Placement accuracy      | Final signature baseline within 5 document points of target; no clipping/collision; ≥90% successful placements over at least 30 attempts split between mouse/touch | Coordinate measurement plus independent output inspection                               |
| Discoverability         | At least 7/8 locate Signature, Date, Text and Undo within 10 seconds each without prompting                                                                        | Timed discovery tasks, reported per tool                                                |
| Keyboard parity         | Complete both journeys with keyboard alone; no focus loss/trap; no focused control hidden by tray/dialog/virtual viewport                                          | Manual keyboard and assistive-technology runs                                           |
| Touch quality           | No accidental mark from scrolling; resize and cancel reliable on iOS Safari and Android Chrome; primary tools aim for 44×44 CSS-pixel hit areas                    | Physical-device trials and measured hit boxes at each zoom                              |
| Non-drag access         | Every drag action has an operable click/tap and keyboard alternative                                                                                               | Manual checks of placement, move, size and page ordering                                |
| Preview/export          | Exact page count/order, supported values and mark content; geometry within 1 point; no missing glyphs across rotated/cropped and multi-page fixtures               | Reopen exported bytes in independent viewers and compare renders                        |
| Visual access           | 4.5:1 normal-text / 3:1 large-text and control-state contrast; visible focus; semantic labels; color never sole cue                                                | Computed contrast, manual states, screen reader and audit findings                      |
| Responsive layout       | No app-level horizontal overflow at 320/390/768/1024/1440px; essential controls reachable at 200% browser zoom and with onscreen keyboard                          | Real renders plus manual scrolling/reflow checks                                        |
| Feedback and resilience | Placement/manipulation visible promptly; no lost edits on page change or failed export; canceled gesture does not enter history                                    | Instrumented interaction, failure/retry and device tests                                |
| Unsaved work            | Explicit exit/replacement guarded; real export revision tracked correctly; tab-termination limitation understood                                                   | Browser journeys plus observed comprehension                                            |

Accessibility references checked for the design: W3C's guidance on
[minimum target size and spacing](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html),
[focus remaining visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html),
and [alternatives to dragging](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html).
The proposed 44px touch goal is a design target above the AA minimum. The
prototype's scaled paper handles/fields need additional work before a compliance
claim; screenshots alone cannot establish accessibility.

## 8. Open design questions

1. Does a one-off signer understand Quick Sign without a separate landing page?
   Test the two sample entry actions against opening directly into the workspace.
2. Is the fixed target alternative understandable without implying automatic
   signature detection? Use generic placement for arbitrary files until validated.
3. Is the mobile properties tray too tall during text editing? Evaluate a
   collapsible summary after placement and physical onscreen keyboards.
4. Should Date offer two formats or use a locale preview? Keep the chosen value
   explicit; never auto-add today's date or infer a legally meaningful date.
5. Which original supported field types need on-page widgets versus an accessible
   field list? Retain all current valid field types before replacing the MVP.
6. Should page organization ship with the focused workspace or as its own slice?
   It expands export/history complexity and should not delay reliable signing.
7. Are two signature styles helpful, and are long names readable across installed
   fonts? Remove choice if it slows completion without improving confidence.
8. How should browser Back navigation and accidental mobile termination be handled
   without promising durable drafts? No new persistence is approved here.
9. Complete the missing DocHub screenshot review when the reference is available.

## 9. Recommended implementation milestones

1. **Design approval and formative testing.** Review this prototype, obtain the
   missing reference, test the task/action budgets and mobile tray, and agree the
   P0 scope. No engine change is authorized by this design milestone.
2. **Workspace shell around the existing engine.** Preserve limits, trusted local
   byte handling and dirty-state rules; adapt the existing supported field types.
   Prove keyboard access and all themes before replacing the current entry.
3. **Direct manipulation and signature quality.** Shared coordinate mapping,
   pointer cancellation, single-transaction history, touch hit areas, exact same
   preview/export glyph source and rotated/cropped-page fixtures.
4. **Export/recovery quality.** Real byte generation/reopening, honest browser
   handoff messages, revision-aware unsaved state and retry-preserving failures.
5. **Page organization.** Independently review reorder/remove, field ownership,
   page association and undo; add rotation only after transform tests.
6. **Release validation.** User tasks, physical devices, assistive technology,
   contrast/reflow checks, performance/limits and production regression evidence.
   Keep the old editor until the replacement satisfies the approved gates.

Library saving remains outside these milestones while required scanning is
unavailable. No quarantine exception, ClamAV installation, AI activation,
certified-signature infrastructure, deployment, commit or push is included.
