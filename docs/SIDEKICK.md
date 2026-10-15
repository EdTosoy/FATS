# FATS Sidekick — Phase 3 architecture

## Account compatibility (Phase 4)

The same capture → review → open FATS → confirm → save path now persists through the selected workspace repository. Signed-in users save only to their PostgreSQL account. Guests can sign in from the confirmation page and return to the same opaque handoff fragment, or deliberately confirm a browser-local save. Expired account sessions block saving and offer sign-in; they never redirect an account save to local storage. The handoff still expires after 15 minutes, including time spent signing in.

Authentication occurs solely on the FATS origin with HTTP-only cookies. Neither the extension nor captured job pages receive credentials or account identifiers. Existing extension permissions, sender/origin/path checks, URL privacy, and text validation remain unchanged. Account saves additionally serialize ID/posting duplicate checks in a database transaction. The local-storage race described below applies only to guest mode. Run `pnpm db:test:up` and `pnpm mail:test:up`, then `pnpm test:extension:account` to verify the original extension journeys plus registration, email verification, login return, and PostgreSQL saving against dedicated test services. See [Phase 4.1 evidence](PHASE_4_1_VERIFICATION.md).

Phase 4.1 keeps the opaque handoff fragment through verification/login and fully reloads the Sidekick destination so Chrome reinjects the path-scoped bridge. Codes/passwords/reset links stay in FATS and the local inbox. Recovery takes time within the same 15-minute handoff lifetime; if it expires, capture/review again. A reset link does not carry a job draft or silently save anything.

Decision recorded before implementation: use a short-lived, user-confirmed local message handoff. The extension never reads or writes the FATS website's local storage. A file transfer would avoid messaging but add a download/file-selection step; direct synchronization would need unnecessary authority over application data. The chosen bridge transfers only one reviewed job draft to a dedicated confirmation page.

## Communication and trust boundaries

- The MV3 extension reads the active page only after Capture Job, using `activeTab` plus `scripting`. It has no all-sites host permission, background crawler, fetch/import service, or site-specific parser.
- A React side panel lets the user correct all extracted fields or paste manually. Review validates the existing application rules; Open FATS stages a single draft in extension `storage.session` for 15 minutes and opens `/sidekick#<random UUID>`. No job fields enter URLs, query strings, referrers, or history.
- The packaged content script runs only on the loopback hosts and immediately exits unless the exact origin is `http://localhost:3000` or `http://127.0.0.1:3000`, the top-frame path is `/sidekick`, and the message comes from that same window/origin. Match patterns cannot restrict ports, so exact runtime checks are mandatory.
- The service worker accepts staging only from its own exact side-panel URL. It accepts retrieval only from its own top-frame content script on those exact FATS origins/path, bound to the chosen destination origin and opaque draft ID. It exposes no external-message listener and no record-management commands. Web messages are requests for a draft, never instructions to execute code or mutate records.
- FATS validates the versioned draft again, lets the user edit it, and requires Confirm and save. The existing provider/repository performs persistence. A draft's UUID is the new application ID; retries find the existing record. An already-saved posting URL also returns its existing application without overwriting it. Manual Phase 1 creation retains its existing behavior.
- A missing/expired draft, extension reload, unavailable bridge, or invalid message leaves saved data untouched and offers retry/manual entry. Opening the confirmation page alone never saves. Session storage clears on extension reload/browser restart; pending data also expires logically after 15 minutes and is removed when accessed after expiry or replaced by a new handoff.

Work arrangement is retained in the existing location string (for example, `Makati · Hybrid`) when saving, avoiding a storage/backup schema change. Missing fields remain blank. HTML descriptions are converted to text in an inert template; extracted markup is never attached/rendered as HTML. Structured data parsing, DOM selectors, and output lengths are bounded. FATS and the extension treat every extracted string as untrusted data.

The initial build supports these two local development origins only. They are separate workspaces; choose the same hostname used for your existing tracker. Arbitrary hosted origins require a separately reviewed permission/configuration change. Avoid other-tab edits while saving: local storage still has its documented simultaneous-writer limitation.

Official references checked: [Chrome side panels](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [temporary activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [message security](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#security-considerations), [session storage](https://developer.chrome.com/docs/extensions/reference/api/storage#property-session), and [Playwright extension contexts](https://playwright.dev/docs/chrome-extensions). Developer commands and actual verification are documented below.

## Permissions and data lifetime

| Permission / scope     | Reason                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`            | Temporary access granted by the user's toolbar action on a job page. After changing website origin, click the toolbar again.                    |
| `scripting`            | Inject the extraction function after Capture Job; no automatic page extraction.                                                                 |
| `sidePanel`            | Open the packaged React interface from the toolbar action (Chrome 116+).                                                                        |
| `storage`              | Hold one pending draft in `storage.session`, restricted to trusted extension contexts. No website records are stored here.                      |
| Content-script matches | Only `http://localhost/sidekick*` and `http://127.0.0.1/sidekick*`. Exact runtime origin/port/path/top-frame checks further restrict retrieval. |

There is no `tabs` permission, unrestricted host permission, cookie access, external messaging, remote code, analytics, or background network access. `tabs.query` obtains only the active tab information Chrome makes available through the temporary grant. The extension CSP permits packaged scripts only and denies network connections from extension pages. The content bridge on the local confirmation route remains available without another toolbar grant; it cannot extract job pages or read application storage.

Capture does not send information to a service or bypass login, paywalls, CAPTCHAs, or protections. Use it only where access and capture are permitted. The source page is still an ordinary website with its own network behavior; Sidekick does not control that page or follow its links.

The web app receives the draft as plain data in memory. Same-origin website code shares that trust boundary; this bridge is not protection against a compromised FATS origin or browser profile. Pending/session drafts are unencrypted, not durable, and absent from JSON backups. Closing/reloading the panel can discard unsent edits. An already-open confirmation form keeps its in-memory copy, but save revalidates expiry. There is no automatic acknowledgment that deletes a handoff after saving; identity/URL checks prevent a sequential retry from adding another record. A later handoff replaces the previous session entry; already-open forms keep their own copies until expiry.

## Supported extraction

- JSON-LD `JobPosting`, including arrays, `@graph`, `mainEntity`, and array-valued `@type`. Reads title, hiring organization name, postal locality/region/country, description, and explicit `TELECOMMUTE` work arrangement.
- A single posting is preferred. When several postings exist, exactly one matching the current page URL may be used; otherwise fields stay blank for manual entry. Structured but partial postings are not filled with guesses from unrelated page content.
- Without a JobPosting, basic itemprop markup, `main`/`article` headings, explicit company/location/work-arrangement attributes or metadata, and description metadata provide a fallback. `og:site_name` is not assumed to be an employer.
- No page-specific third-party adapter is shipped. Dynamic pages may need capture after content finishes loading. Only the top document is inspected; shadow roots and embedded frames are outside this slice.
- At most 20 JSON-LD scripts, 200,000 characters per script, 500,000 total characters, 2,000 visited objects, and depth 12 are inspected. Text output respects existing field limits. Oversized/unreadable structured data gives a review warning. A source URL over 2,048 characters stays blank rather than silently saving a truncated link. Always check extracted details for truncation or incomplete information.
- HTML descriptions are parsed only inside an unattached inert template. Resource/executable elements are removed, and only text is returned. React renders strings normally; no `dangerouslySetInnerHTML`, site instruction execution, or HTML-based application data exists.

Source URLs are validated as HTTP(S), without embedded credentials. Their existing query parameters are retained because they may identify a job; users can edit tracking/sensitive parameters before saving. Sidekick never appends job text to these URLs. Duplicate comparison removes fragments only, so two tracking variants of the same posting may still require the user's judgment. The application creation API rejects a combined location/work-arrangement longer than its existing 160-character limit.

## Developer workflow

From the repository root, with the pinned Node/pnpm versions:

```sh
pnpm install --frozen-lockfile
pnpm build:extension
pnpm verify:extension
pnpm dev
```

1. Open Chrome 116+ → `chrome://extensions` → Developer mode → Load unpacked → `apps/extension/dist`.
2. Pin Sidekick. Open one permitted HTTP(S) job page and click the toolbar icon. This both grants temporary access and opens the native side panel.
3. Capture Job; review/correct all fields, or type/paste manually. Missing employer/title/location information is never invented.
4. Review details; select the FATS origin used for your existing records. Open FATS to confirm. The local app must already be running; there is no extension-owned backend or server health probe.
5. Edit the confirmation form if needed, then Confirm and save. Check the Saved application and reload. Existing jobs and interviews remain unchanged.
6. Rebuild after source edits, then reload the extension in Chrome and refresh FATS. This clears pending handoffs. Loading/unloading/pinning the extension is a manual developer step, not an in-app configuration flow.

`pnpm build` builds only the Next app; `pnpm build:extension` builds only the extension plus required domain checks. `pnpm start` can serve a successful production web build at the same local port. Keep build/dev browser runs sequential because they share Next's output directory.

## Verification workflow and browser limits

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm test:e2e
pnpm test:extension
pnpm build
pnpm build:extension
pnpm verify:extension
```

`test:e2e` runs the desktop/mobile web regressions. `test:extension` builds/verifies the package, launches an isolated persistent Chromium profile with the actual extension installed, and serves controlled fixture pages from `tests/fixtures/jobs` through Playwright routes. The fixture origin is external to the bridge's loopback matches, so capture must obtain real `activeTab` authority. Tests exercise the actual toolbar action using Chromium's test-only DevTools Extensions API. The `--enable-unsafe-extension-debugging` flag exists only in that isolated test launch, never in the package or manual user instructions. Chromium's OS sandbox stays enabled.

Playwright does not expose Chromium's native dock as a normal page. Automation therefore drives the exact packaged `sidepanel.html` document in an extension tab, while capture uses the granted job tab; the actual worker, script injection, session storage, content bridge, web confirmation, and repository remain in the path. Native dock resizing/pinning and a manual installed-Chrome smoke session have not been verified. The CDP toolbar test requires a recent Chromium; Chrome 116 is the package API minimum, not a guarantee that this newer test-only CDP method exists there. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if needed. Firefox, Edge, Chrome Web Store packaging/review, and native mobile extensions are not covered.

Actual commands, results, screenshots, and remaining limits are in [PHASE_3_VERIFICATION.md](PHASE_3_VERIFICATION.md). Official details: [match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns), [content-script isolation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), and [test-only DevTools Extensions API](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/).
