# PDF Tools 2.0 — manual device and assistive-technology checks

Status: **NOT RUN on physical devices or a screen reader in this pass.**
These are release-validation tasks for staged engineering, not a request for
another workspace redesign. Use only the fictional samples at the development
route `/design/pdf-tools`. Nothing on this route creates or saves a PDF.

## iOS Safari

- [ ] On a narrow iPhone, open the sample form. Select Full name through Page
      contents. Type an accented synthetic name with the software keyboard.
      Both the selected field and the full-size value editor remain visible.
- [ ] Type into an added text mark. Scroll the document while typing; retain the
      draft and selection. Dismiss the keyboard using its own control, then use
      Done. Confirm stable layout, correct value, and focus/selection restoration.
- [ ] Repeat in landscape, with browser bars expanded/collapsed, and with device
      text enlargement. Open Advanced and edit a numeric size with the keyboard.
      The focused input and Done remain reachable. Check safe-area insets.
- [ ] At 25%, 50%, 100% and 200% PDF zoom, select/move/resize/delete a mark.
      At overview scale, use the grouped field picker; for overlapping marks,
      choose their names through Page contents. Scroll from empty paper space.
- [ ] Pinch the browser view and restore it. Confirm it is not treated as a
      software keyboard, and that standard browser zoom remains available.

## Android Chrome

- [ ] Repeat the typing, scrolling, keyboard-dismissal, numeric-entry and touch
      checks above with the installed device keyboard. Include suggestion/IME
      composition and the system Back action that dismisses the keyboard.
- [ ] Confirm the resized visual viewport keeps the editor above the keyboard
      without double-shrinking or jumping. Test rotation and browser toolbar changes.
- [ ] Try `Li`, `Alex Rivera`, `María José de la Cruz`, and
      `Alexandria Remedios Santiago Villanueva` in both signature styles. Scroll
      a long preview to its end. Try the last name repeated three times: expect
      overflow feedback and disabled confirmation, not an unreadably small mark.
- [ ] Attempt to shrink a placed signature too far, then change its name to one
      that cannot fit. Expect feedback, preserved text and disabled download
      preview until corrected. Review wide signatures for placement collisions.

## Screen reader and keyboard

Use VoiceOver/Safari or TalkBack/Chrome on a device; additionally use
NVDA/Firefox or NVDA/Chrome with a desktop keyboard when available.

- [ ] Find PDF Tools, Skip to document controls, current page, Page contents,
      supported fields, added marks and Selected element properties in a useful
      order. The printed sample artwork is explicitly outside the editor's
      accessible content interface; no accessible PDF reading/tagging is claimed.
- [ ] Choose a field or mark by name. Hear what is selected and its value. Type,
      use Enter to open a mark's properties, and return with Done. Verify actual
      spoken announcements, not just the browser accessibility-tree roles.
- [ ] Place a signature without coordinates. Move it using arrows, Shift+arrows
      and the named movement buttons; resize through the single handle/Advanced;
      delete and Undo/Redo. Check focus after deletion and modal cancellation.
- [ ] Complete a keyboard-only signing and form-editing journey. Check reverse
      Tab, browser text zoom at 200%, visible focus, native select keys, dialog
      containment and absence of unintended traps or intercepted input shortcuts.
- [ ] Verify signature overflow is announced without repeatedly interrupting
      typing. Download review must say this is a preview and no PDF is created.
      Keep editing restores focus; a preview never clears the memory-only warning.

Record device/OS/browser/keyboard or screen-reader versions, viewport/orientation,
steps, observed result and any assistance. Real PDF crop/rotation, font embedding,
field-type parity, preview/export consistency and accessible PDF reading/tagging
require separate engine evidence; passing this checklist does not establish them.
