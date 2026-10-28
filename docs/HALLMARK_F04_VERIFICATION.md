# Hallmark F04 — mobile application status

28 October 2026. Scope: application-detail status placement and its feedback.

## Preflight and reproduced problem

Read repository/web instructions, the Hallmark decision brief and F04 audit finding, and the F03/Next.js security verification reports. At initial inspection HEAD was F01 and the prior work was uncommitted. During this task, commits `f20a57e` and `34bdf74` landed containing F03 and the Next.js patch/report. The original file contents were preserved; this task created no commits. Installed Next.js remains **16.4.1**.

Fresh current-source browser captures reproduced F04 at desktop/mobile widths in both themes: **4/4 baseline captures passed**. At 390×664, the original posting action started at **467px**, while the status select started at **1,214px**, after interview and description panels.

## Implementation and rationale

The single native status select now sits in the existing overview card directly after “Open job website,” ahead of the raw URL, interviews, documents/offers, and job description. Moving it in the DOM preserves the natural keyboard order; no CSS visual reordering or duplicate control was introduced. The posting link and select have **44px minimum heights**. Supporting status text is 13px and its label is 14px, using existing design tokens.

The old progress card retains Saved on/Last updated as **“Application record.”** Desktop retains its existing two-column structure. The read-only status badge still derives from the same persisted application.

All seven options, the `changeStatus` handler, repository calls, validation and state-after-persistence behavior are unchanged. Success/saving feedback sits immediately under the select, before helper text, so confirmation remains visible in the tested initial mobile viewport. A failed write associates its alert with the select through `aria-describedby`/`aria-invalid` and says **“Status is still …”** instead of suggesting the update succeeded. Retry uses the same existing handler.

Two existing tests now locate feedback in `.application-status` rather than the old progress card. New focused browser tests cover the moved control and local/account write recovery. No domain, authentication, ownership, dependency, navigation, or AI changes.

## Before/after evidence

[20 selected screenshots](../.fats-private/f04/SCREENSHOTS.md): saved/applied/error states and real-account captures in light/dark themes. Baselines use a fresh development render; after captures use the rebuilt production app. Only isolated synthetic data was used. Desktop: 1440×1100; mobile: 390×664 CSS pixels.

| Saved application | Before                                                                  | After                                                                  |
| ----------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Desktop/light     | [Open](../.fats-private/f04/screenshots/before-desktop-saved-light.png) | [Open](../.fats-private/f04/screenshots/after-desktop-saved-light.png) |
| Desktop/dark      | [Open](../.fats-private/f04/screenshots/before-desktop-saved-dark.png)  | [Open](../.fats-private/f04/screenshots/after-desktop-saved-dark.png)  |
| Mobile/light      | [Open](../.fats-private/f04/screenshots/before-mobile-saved-light.png)  | [Open](../.fats-private/f04/screenshots/after-mobile-saved-light.png)  |
| Mobile/dark       | [Open](../.fats-private/f04/screenshots/before-mobile-saved-dark.png)   | [Open](../.fats-private/f04/screenshots/after-mobile-saved-dark.png)   |

After: the mobile select starts at **557px** and ends at **601px**, fully visible without scrolling in both themes—about **657px earlier**. The posting-to-select gap is 46px, including the label. Desktop select starts at 496px and remains visible. [Recorded measurements](../.fats-private/f04/positions-after.json). Inspected actual mobile/desktop renders for placement, wrapping, hierarchy and feedback.

## Executed verification

Node 24.21.0 / pnpm 11.27.0. Chromium sandbox enabled, fresh contexts, loopback ports 3198/3199. Account tests used the dedicated `_test` database and local Mailpit. AI disabled throughout.

| Check                                                                                                              | Result                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm typecheck`                                                          | **PASS**, all four projects; domain/extension cached. Final test edits also passed `pnpm exec tsc -p tsconfig.tools.json --noEmit`.                                                                                                                                        |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm lint`                                                               | **PASS**, all four projects; domain/extension cached. Final focused test edits passed scoped ESLint.                                                                                                                                                                       |
| `FATS_AI_MATCHING_ENABLED=0 FATS_AI_PROVIDER= OPENAI_API_KEY= NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm build` | **PASS**, current production build. Existing scanner filesystem-tracing warnings remain.                                                                                                                                                                                   |
| Serial unit suite¹                                                                                                 | **FAIL**: 308/309 passed; only the existing matching-plan source-hash mismatch.                                                                                                                                                                                            |
| Production guest browsers²                                                                                         | **PASS**, 32/32 across desktop/mobile; after the final feedback-order refinement, the focused four journeys also passed **4/4**, including confirmation visibility in the initial viewport.                                                                                |
| Production account browsers³                                                                                       | Eight existing account scenarios passed. The new fixture initially queried the session before sign-in completed; added its missing navigation wait. Final account-status reruns **PASS**, 2/2, each exercising both themes, including after the feedback-order refinement. |
| `pnpm format:check`; `git diff --check`; preservation checks                                                       | **PASS**; original F03/security files and moodboards preserved, original CSS retained verbatim with scoped rules appended, and generated route references restored.                                                                                                        |

```sh
# ¹ Live AI disabled; serial execution avoids known document-worker contention.
FATS_AI_MATCHING_ENABLED=0 FATS_EVAL_LIVE=0 FATS_COMPARISON_LIVE=0 OPENAI_API_KEY= NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm test -- --no-file-parallelism
# ² FATS_TEST_PORT=3198 FATS_TEST_PRODUCTION=1
pnpm exec playwright test tests/e2e/application-status.spec.ts tests/e2e/applications.spec.ts tests/e2e/interviews.spec.ts tests/e2e/offers.spec.ts --output=.fats-private/f04/after-guest
# ³ FATS_TEST_PORT=3199 FATS_TEST_PRODUCTION=1
pnpm test:e2e:account application-status.spec.ts accounts.spec.ts --grep 'account status saves|expired sessions|invalid login|dashboard preserves populated|guest identity becomes' --output=.fats-private/f04/after-account
pnpm test:e2e:account application-status.spec.ts --output=.fats-private/f04/after-account-final
# Final feedback-order checks, same production ports/configuration
pnpm exec playwright test tests/e2e/application-status.spec.ts --output=.fats-private/f04/after-feedback
pnpm test:e2e:account application-status.spec.ts --output=.fats-private/f04/after-account-feedback
```

Verified: Saved → Applied by keyboard; focus from posting link to select and retained after local update; every supported transition and reload; unchanged status badge; Interview without an invented schedule; single select; touch target sizes; unchanged persistence on failed writes; visible error/old status; successful retry; long descriptions/URLs without pushing the control down or creating horizontal overflow. Existing form editing, modal focus, filtering, interview lifecycle, cross-tab changes and guest Offer behavior passed.

Real-account tests also verified server-persisted status after reload, a deliberately injected HTTP 503 before the server write, unchanged server records on failure, successful retry, and no fallback to guest storage. No collected page errors in final account journeys; final guest checks collected both page/console errors and reported none. The initial guest preview had a test locator mistake (a paragraph was treated as a heading); corrected without changing product behavior.

## Limitations

The unchanged `matching-comparison-plan.test.ts:39` regression expects extraction hash `23dd7d8…`; unchanged source hashes to `f6792e8…`. It remains separate from F04. No matching expectations or source were repaired.

Evidence is local and Git-ignored. Screen readers, physical touch devices and full accessibility conformance were **NOT RUN**. First-viewport measurements apply to the synthetic job shown; very long titles/company names or browser zoom can add normal wrapping. The control still precedes long description/interview content. The full browser/product/extension suites were **SKIPPED** in favor of affected journeys; the product journey’s feedback selector was updated but that full journey was not rerun.

Dedicated test services were stopped after verification. No commits, pushes, deployments, live AI requests, or changes to security/ownership rules were made by this task.
