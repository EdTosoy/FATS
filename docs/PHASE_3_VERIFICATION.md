# Phase 3 — FATS Sidekick verification

Implemented and verified locally on 2026-10-15 with Node 24.21.0, pnpm 11.27.0, and system Chromium 153.0.8010.52. Starting Git status was clean on `feat/manual-interview-management`, at `bfa4e8d`. Existing Phase 1/2/2.1 implementation and brand assets were preserved. No commits, pushes, publication, deployment, backend, or Phase 4 work were performed. The earlier PR-preparation request is not a publication authorization for this slice.

## Architecture and working behavior

The pre-implementation handoff decision is recorded in [SIDEKICK.md](SIDEKICK.md). `apps/extension` is a separate Nx/pnpm project using Chrome Manifest V3, TypeScript, React, and esbuild. It builds independently from Next. New direct development dependencies are pinned `esbuild` 0.28.2 and `@types/chrome` 0.3.5; React and domain contracts reuse the workspace. The existing esbuild native-build approval is retained. No runtime service or framework was introduced.

The toolbar grants temporary access and opens the side panel. Capture Job explicitly inspects the current top document. Structured JobPosting JSON-LD is preferred, including arrays/graphs; basic semantic HTML and metadata provide the fallback. Missing fields remain blank, ambiguous multi-job pages require manual entry, and every field is editable. No site-specific platform adapter, background crawl, fetch, or application submission is implemented. Manual type/paste works when extraction or permission is unavailable.

Review → Open FATS holds one validated draft in trusted extension session storage and opens the chosen local FATS origin with only an opaque UUID in the fragment. Captured fields do not enter URL parameters, history, or referrers. The isolated-world bridge and worker check same-window messages, correlation IDs, extension sender identity, exact app origin/port/path/top frame, destination binding, schema, and expiry. The extension exposes no external-message listener or repository commands and never reads/writes the website's storage. Same-origin FATS code remains part of the trust boundary.

FATS validates again and provides an editable confirmation form. Only Confirm and save uses the existing provider/repository/domain creation rules. Saved status, IDs, timestamps, current applications, and interview relationships are preserved. Repeated confirmation IDs and already-saved posting URLs return an existing record without overwriting it. URL comparison removes fragments while retaining query parameters; two tracking variants can remain distinct. A synchronous submission guard protects double clicks. Local storage still cannot promise transactional writes across simultaneous tabs.

Work arrangement is combined with the existing location string. Storage envelope version 1, backup format version 1, and Phase 1/2 data compatibility remain unchanged. Saved Sidekick applications are ordinary records covered by existing backups. Session/unsent drafts are not backed up. Session drafts have 15-minute validity, are replaced by another handoff, and clear on extension reload/browser restart. Expired data is removed on access rather than by a guaranteed timer. Already-open forms retain an in-memory copy but save checks expiry again.

Required permissions are `activeTab`, `scripting`, `sidePanel`, and `storage`. Static bridge matches cover only the two loopback hosts' `/sidekick*` pages; exact runtime checks enforce `http://localhost:3000/sidekick` or `http://127.0.0.1:3000/sidekick`. Chrome patterns cannot restrict ports. There are no unrestricted host permissions, cookies, `tabs` permission, external messaging, remote code, or analytics. Extension-page CSP denies network connections. Descriptions are converted in an inert unattached template and rendered as text, never executable HTML or instructions.

## Executed commands and results

Nx commands below were prefixed with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. Native workers, local servers, and Chromium used scoped environment permission. Chromium's OS sandbox stayed enabled; tests used temporary isolated profiles and synthetic records, never a user's browser workspace.

| Command / check                                                  | Result | Evidence                                                                                                                                             |
| ---------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                                   | PASS   | Installed the two pinned development dependencies and updated the workspace lockfile.                                                                |
| `pnpm install --frozen-lockfile --offline`                       | PASS   | All four workspace packages up to date; no resolution changes, 465 ms.                                                                               |
| `pnpm typecheck --skip-nx-cache`                                 | PASS   | All four projects, including the extension and both Playwright configurations; final run 7.0 seconds.                                                |
| `pnpm lint --skip-nx-cache`                                      | PASS   | All four projects, including extension build/package verification scripts; final run 6.1 seconds, exit 0.                                            |
| `pnpm test --skip-nx-cache`                                      | PASS   | Seven files, all 137 unit tests; Vitest 375 ms.                                                                                                      |
| `pnpm exec vitest run`                                           | PASS   | Seven files, all 137 tests in a direct earlier run.                                                                                                  |
| `pnpm test:e2e`                                                  | PASS   | All 40 desktop/mobile journeys, including all 36 Phase 1/2/2.1 regressions; 2.1 minutes.                                                             |
| `pnpm test:extension`                                            | PASS   | Package build/verification plus all eight actual Chromium-extension journeys; final browser run 32.0 seconds.                                        |
| `pnpm build --skip-nx-cache`                                     | PASS   | Optimized Next production build, TypeScript, existing routes and the new `/sidekick` route; 8.6 seconds.                                             |
| `pnpm build:extension --skip-nx-cache` + `pnpm verify:extension` | PASS   | Independent uncached build, 2.5 seconds; generated Manifest V3 package, exact permissions, bridge matches, and bundled files verified.               |
| `pnpm format:check`                                              | PASS   | Repository-wide Prettier check, including existing brand documentation and all new extension sources.                                                |
| `git diff --check` and original moodboard SHA-256 comparison     | PASS   | No tracked whitespace errors. All four existing `uiux/*.png` files match Git HEAD, including the three original moodboards and brand identity board. |

Next's lint preset still prints a Pages-directory diagnostic in the App Router/domain tasks, while lint exits successfully with no lint violations. Node prints `NO_COLOR`/`FORCE_COLOR` tooling warnings. These are disclosed diagnostics, not suppressed failed checks. The plain React extension specifically disables only Next's image/routing rules because it has no Next runtime; React/type/security-related lint rules remain active.

## Acceptance evidence

- **Domain/repository:** versioned known-fields projection, existing creation rules, plain text and safe HTTP(S) URL validation, required fields, work-arrangement handling, UUIDs, exact allowed origins/ports/path, sender identity, top-frame checks, expiry at the boundary, future/oversized TTL rejection, duplicate IDs and posting URLs, persistence through a new adapter, existing-record preservation, invalid input, and failed writes.
- **Actual extension:** toolbar-granted access on an external controlled fixture origin; structured extraction; user field correction; keyboard review; 320 px overflow check; FATS confirmation; double-click protection; one Saved record; reload recovery. The other journeys cover semantic extraction, missing/malformed data, malicious markup/instruction text with no resource request/execution, real permission denial after an origin change, unsupported browser pages, full manual paste/save, expiry/removal, forged-origin messages, quota failure with retained draft/retry, actual extension reload, and ambiguous multiple jobs.
- **Web regressions:** applications, all statuses, filtering, detail edits, interview lifecycle/timezones/notes/relationships/dashboard, corruption and persistence failures, backup roundtrips/validation/cancellation/restore, keyboard forms, and desktop/mobile layouts. Four new web cases cover an unavailable/absent extension and manual entry/reload, plus missing/forged handoffs without writes.
- **Screenshots:** local synthetic screenshots under `test-results/extension/sidekick-real-toolbar-perm-2a578--→-persistent-single-record-extension/` show the 320 px panel review and mobile (360 px)/desktop (1440 px) FATS confirmation, plus the saved state. Panel/mobile/desktop confirmation images were inspected: labels, visible focus, actions, text wrapping, and surfaces fit without horizontal overflow. Only synthetic jobs and the explicitly labeled Maria sample profile appear. No screenshots were uploaded.

## Findings resolved during verification

An initial esbuild run resolved the workspace's symlink to a stale native path. The build now uses the package working directory with preserved workspace symlinks, while resolving React DOM's scheduler through its installed pnpm package. Both builds are checked independently.

Actual toolbar tests caught a temporary-permission issue with automatic panel-opening behavior. An explicit action-click listener now opens the panel after Chrome grants activeTab, and the real fixture-origin script injection passes. Initial test harness attempts used a page CDP session/target; Chrome's test-only toolbar command requires the browser CDP session and tab target. That harness was corrected without giving the extension extra production permissions.

The final browser rerun exposed a brittle expired-message assertion. Development Strict Mode can request a capture twice: one request removes the expired entry, and the next correctly reports it unavailable. The test now accepts either truthful stale state and explicitly verifies session removal and no saved record. The complete eight-test suite then passed. No product safety assertion was removed.

## Browser-specific limits

Automation loads the actual unpacked extension in persistent Chromium, triggers the real toolbar action through the test-only DevTools Extensions API, and exercises the real worker, injection, session storage, content bridge, website, and repository. Playwright does not expose the native dock as a normal page, so tests drive the exact packaged side-panel document in an extension tab. Native docking/pinning/resizing and a manual installed-Chrome session have **not** been verified. The test-only `--enable-unsafe-extension-debugging` flag is absent from the package and manual workflow.

Browser integration uses the documented Next development server. A separate production-server browser journey, Chrome 116 runtime, other Chromium releases, Edge/Firefox/WebKit, native mobile extension, store submission, full accessibility audit, and assistive-technology session were not run. Chrome 116 is the manifest API minimum; the test-only CDP action API needs a recent Chromium.

## Files added or modified

New extension project:

```text
apps/extension/build.mjs
apps/extension/verify-package.mjs
apps/extension/package.json
apps/extension/tsconfig.json
apps/extension/manifest.json
apps/extension/sidepanel.html
apps/extension/icon-32.png
apps/extension/icon-128.png
apps/extension/src/background.ts
apps/extension/src/bridge.ts
apps/extension/src/security.ts
apps/extension/src/extract.ts
apps/extension/src/panel.tsx
apps/extension/src/panel.css
```

The two icons are copies of existing FATS brand assets. Original brand assets and all three `uiux/*.png` references remain unchanged. Generated `apps/extension/dist`, Next output, dependency/cache files, and screenshots remain ignored.

Other new files:

```text
libs/domain/src/capture.ts
apps/web/src/app/sidekick/page.tsx
apps/web/src/components/sidekick-intake.tsx
apps/web/src/lib/sidekick-bridge.ts
playwright.extension.config.ts
tests/unit/capture.test.ts
tests/e2e/sidekick.spec.ts
tests/extension/sidekick.spec.ts
tests/fixtures/jobs/structured.html
tests/fixtures/jobs/semantic.html
tests/fixtures/jobs/partial.html
tests/fixtures/jobs/malicious.html
docs/SIDEKICK.md
docs/PHASE_3_VERIFICATION.md
```

Updated:

```text
libs/domain/src/application.ts
libs/domain/src/index.ts
apps/web/src/lib/local-application-repository.ts
apps/web/src/components/application-provider.tsx
apps/web/src/app/globals.css
package.json
pnpm-lock.yaml
tools/project.json
tsconfig.tools.json
eslint.config.mjs
.prettierignore
AGENTS.md
README.md
docs/PRODUCT.md
docs/ARCHITECTURE.md
docs/ROADMAP.md
docs/VERIFICATION.md
```

## Remaining limitations and next step

This is an unpacked local-development extension. Only the exact two local app origins on port 3000 are supported; they keep separate existing storage. There is no deployment or hosted-origin configuration, cloud sync, site-specific compatibility guarantee, or automated application. Capture reads only accessible current top-document content after explicit action; websites/protections may prevent it. Description extraction is bounded and may be incomplete. Every field must be reviewed.

Unsent drafts are volatile, and session validity is short. There is no durable draft recovery, post-save acknowledgment/deletion, merge, automatic undo, or multi-tab transaction/lock. Existing private browser storage and unencrypted backup limitations remain. Job source URL query parameters may contain tracking information; users can edit them. Arbitrary job-page content remains untrusted text.

Recommended next step: a manual Chrome native-dock usability session, then separately scope unsaved-draft protection for Sidekick and existing forms. No Phase 4 work is started.
