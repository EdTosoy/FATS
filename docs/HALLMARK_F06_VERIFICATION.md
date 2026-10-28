# Hallmark F06 — persistent application filters

28 October 2026. Scope: application-list URL state and return navigation.

## Preflight and root cause

Read repository/web instructions, the Hallmark audit/decision brief, and F04 verification. F03/security work is committed in `f20a57e`/`34bdf74`; F04 was still uncommitted at preflight and was preserved. No commits were created by this task.

The list used component-local `useState` for query/status. Reloading or remounting reset both controls. A fresh-source browser reproduction passed on desktop/mobile: entered search/status reset after reload. Existing ordering is fixed to most recently updated first; there is no selectable sort or additional filter to persist.

## Implementation and URL contract

- `q` stores deliberate search text, `status` stores one of the existing seven statuses. Empty search and All omit their parameters. URL state is authoritative through Next.js `useSearchParams`; no parallel local filter state or storage preference was added.
- Native History API integration follows installed Next.js documentation (`04-linking-and-navigating.md`, Native History API). Typing uses `replaceState`, avoiding a history entry per keystroke; status changes and clearing use `pushState`, allowing Back/Forward between views. Equal URLs are not written. These updates do not initiate server navigation or remount the list.
- Validation rejects duplicate filter keys, unknown statuses, control characters and queries longer than 500 characters. Invalid values safely read as default controls without navigation loops. Subsequent edits normalize the filter keys. Unrelated parameters and hash are preserved during list edits/clearing.
- Both row links carry only validated `q`/`status` into detail URLs. The server validates those parameters again and supplies the filtered “Back to applications” destination. Browser Back also restores the original list URL. Arbitrary redirect destinations and unrelated query values are not forwarded.
- Existing search semantics, ordering, ownership and repositories remain unchanged. The existing clear action is also available when active filters have matches or the workspace is empty. The existing no-match state remains helpful. No new panel, dependency, domain or authentication change.

Only explicitly entered search text and status are added to URLs. No application fields, document text, credentials, session identifiers or tokens are automatically copied. Search terms are visible in browser history/shared URLs; users should avoid entering secrets. Links share a view, not access to someone else’s records.

## Evidence

[Before desktop](../.fats-private/f06/before-results/before-reproduce-filter-reset-desktop/before.png) · [Before mobile](../.fats-private/f06/before-results/before-reproduce-filter-reset-mobile/before.png).

Before captures use an empty isolated guest workspace with entered filters; reload assertions establish their loss. After captures use one synthetic application and show the persisted combined view in both themes. Evidence is local and Git-ignored. Desktop 1440×1100; mobile 390×664 CSS pixels.

After captures: [application-filters-dark-U-e7880-ory-detail-return-and-clear-desktop](../.fats-private/f06/final/application-filters-dark-U-e7880-ory-detail-return-and-clear-desktop/filtered.png) · [application-filters-dark-U-e7880-ory-detail-return-and-clear-mobile](../.fats-private/f06/final/application-filters-dark-U-e7880-ory-detail-return-and-clear-mobile/filtered.png) · [application-filters-light--75c73-ory-detail-return-and-clear-desktop](../.fats-private/f06/final/application-filters-light--75c73-ory-detail-return-and-clear-desktop/filtered.png) · [application-filters-light--75c73-ory-detail-return-and-clear-mobile](../.fats-private/f06/final/application-filters-light--75c73-ory-detail-return-and-clear-mobile/filtered.png). Inspected the rendered mobile view for usable controls, clear action and unchanged layout.

## Verification

Node 24.21.0, pnpm 11.27.0, Next.js 16.4.1. Chromium sandbox enabled; isolated browser contexts; AI disabled. Account verification uses only the dedicated `_test` PostgreSQL and loopback Mailpit.

- **PASS**: repository TypeScript, lint and production build. Final edits also checked with scoped ESLint and test TypeScript.
- **FAIL**, separate existing regression: serial unit suite passed **309/310**, including the new URL parsing/encoding test. Only `matching-comparison-plan.test.ts` fails on the unchanged frozen extraction-source hash. No matching files or expectations were repaired.
- **PASS**, authenticated browser selection **2/2**: real account data survives filtering, reload and detail return, with no guest-storage fallback.
- **PASS**, final guest browser selection **18/18**; **PASS**, formatting and diff checks. The initial selection passed 16/18; two old assertions expected a detail URL without filter context. Updated those expectations to the required URL behavior, preserving their status/persistence assertions.

Commands:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test -- --no-file-parallelism
FATS_AI_MATCHING_ENABLED=0 OPENAI_API_KEY= NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build
FATS_TEST_PORT=3198 FATS_TEST_PRODUCTION=1 pnpm exec playwright test tests/e2e/application-filters.spec.ts tests/e2e/applications.spec.ts --output=.fats-private/f06/final
FATS_TEST_PORT=3199 FATS_TEST_PRODUCTION=1 pnpm test:e2e:account accounts.spec.ts --grep 'account application filters' --output=.fats-private/f06/account
pnpm format:check
```

Focused journeys exercise combined search/status, reload, Back/Forward, detail navigation/reload/return, keyboard clearing, unknown/duplicate parameters, empty results, preserved unrelated list parameters, history length while typing, and responsive layouts. Existing application creation/editing, all status transitions, modal keyboard behavior, corruption and failed writes are included. No collected page errors in the filter journeys.

## Known limitations

Search edits replace the current history entry; Back does not undo individual keystrokes. Unrelated list parameters/hash are deliberately not carried through detail links; only validated filter context returns. Invalid raw parameters remain visible until edited, while controls/results use safe defaults. The 500-character bound is intentional. No new sorting control was introduced.

Screen readers, physical devices, the full browser/extension suites and live AI were **NOT RUN**. The authenticated journey exercises the shared filter implementation with real ownership; theme coverage is in guest journeys. No commit, push or deployment.
