# FATS D1 — protected guest deployment

29 October 2026. **Online and verified. Vercel login is required.**

## Deployment identity

| Item                    | Verified value                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Stable protected URL    | <https://fats-edtosoys-projects.vercel.app>                                                                                   |
| Exact deployment URL    | <https://fats-jczj5a2wn-edtosoys-projects.vercel.app>                                                                         |
| Deployment              | `dpl_4qByXMSZj1L2DLNTus4BsmG59oh6`, `READY`                                                                                   |
| Project                 | `fats` / `prj_B9HQTvlHrea9AMkskc1NJ40D7x7F`                                                                                   |
| Account/team            | `edtosoy` / `edtosoys-projects`, Hobby                                                                                        |
| Deployed commit         | [`6473d9ab95eb808080ab671e809c9c0cc93d0543`](https://github.com/EdTosoy/FATS/commit/6473d9ab95eb808080ab671e809c9c0cc93d0543) |
| Vercel environment      | **Production**, with Vercel Authentication protecting **All Deployments**                                                     |
| Function region/runtime | Singapore `sin1`, Node.js `24.x`, Fluid compute                                                                               |

The creation request specified Preview, but Vercel assigned the first deployment to Production. This is the observed environment, not a public launch: protection was configured atomically when the project was created, before deployment, and covers production aliases. No custom domain was attached. Both returned Git source SHA and deployment metadata match the reviewed commit.

Application changes were already committed and available on GitHub. The pre-existing untracked D0 report was preserved. No application source, dependency, commit or push was added for D1. Deployment used the Git revision, excluding ignored environment files, test evidence and local credentials.

## Configuration actually used

Read back through the authenticated Vercel API/CLI; matches [D0](FATS_DEPLOYMENT_READINESS.md):

- Next.js preset; Root Directory `apps/web`; outside-root workspace sources enabled.
- Install: `cd ../.. && pnpm install --frozen-lockfile`.
- Build: `cd ../.. && pnpm build`.
- Output: framework default `.next`; Node `24.x`; pinned pnpm **11.27.0** and Next **16.4.1**.
- Basic build machine, Hobby plan, no additional infrastructure or paid services. No Neon project, database migration, hosted-auth implementation, scanner installation or AI call.

Configured environment **names** in Preview and Production: `ENABLE_EXPERIMENTAL_COREPACK`, `NX_DAEMON`, `NX_ISOLATE_PLUGINS`, `NEXT_TELEMETRY_DISABLED`, `FATS_AI_MATCHING_ENABLED`. Their non-secret settings match D0; AI remains disabled. `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, document storage/scanner directories, provider credentials and test flags were not configured. Vercel supplies its own platform variables.

## Protection and test access

**PASS:** project protection is `ssoProtection.deploymentType=all`. Fresh unauthenticated Chromium contexts were checked before testing and again after credential cleanup. Homepage, `/api/account` and `/resumes/pdf-tools` return **302 to `vercel.com`** on all three generated hosts: exact deployment, stable production alias and Git alias. The browser reaches Vercel login and cannot see the FATS workspace.

Authorized tests used a project-specific automation credential created by the authenticated CLI, then an origin-scoped authorization cookie. Credentials were handled in process memory; no secret URL, public share link, browser trace or committed credential was created. The temporary automation credential was revoked after testing; a separate project read confirmed **zero remaining automation credentials** and All Deployments protection unchanged. [Vercel protection](https://vercel.com/docs/deployment-protection), [documented automation access](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

## Executed smoke tests

**24/24 existing browser tests passed against the exact hosted deployment**, using sandboxed Chromium, isolated contexts and synthetic jobs/PDFs. Desktop: 1440×1100. Mobile: 390×664; PDF workflows additionally exercise 360px. Both light and dark themes were exercised.

| Scenario                                                                                                       | Result                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Fresh guest dashboard and empty application list                                                               | **PASS**, no invented records; fits desktop/mobile                              |
| Save/edit application → reload → retained details/statistics                                                   | **PASS**                                                                        |
| All seven statuses, keyboard changes, reload persistence, local write failure/recovery                         | **PASS**, both themes/widths                                                    |
| Search + status filters, URL reload, Back/Forward, detail return, clear and invalid parameters                 | **PASS**, both themes/widths                                                    |
| Local PDF fields, text/signature marks, review, undo/redo, page/zoom changes, cancellation and actual download | **PASS**, both themes/widths                                                    |
| PDF export failure recovery and pending fields included in download                                            | **PASS**; representative exports retain page counts, boxes and rotations        |
| Restricted document guidance and usable local PDF actions                                                      | **PASS**; tested journeys send no mutation requests                             |
| `/dev/pdf-tools-v2` and `/design/pdf-tools`                                                                    | **PASS**, production not-found UI; no candidate editor controls                 |
| Hosted account API and sign-in                                                                                 | **PASS**: API returns no user and configured false; sign-in submission disabled |
| AI endpoint                                                                                                    | **PASS**, `403 MATCHING_DISABLED`                                               |

The hosted selection reuses `applications.spec.ts`, `application-status.spec.ts`, `application-filters.spec.ts`, `pdf-workflow.spec.ts`, `document-availability.spec.ts` and `pdf-tools-v2-boundary.spec.ts`. The ignored hosted config changes the base URL, supplies only the authorization cookie, disables the local web server and turns traces off. Application/test assertions were not weakened.

Additional executed checks:

- **PASS:** Vercel frozen install and Nx production build, including TypeScript. Build output completed in approximately 37 seconds. D0's scanner filesystem-tracing warnings remain; no new runtime failure was observed.
- **PASS:** audit of 20 loaded client JavaScript assets found neither the test credential nor checked credential patterns (PostgreSQL credential URLs, private keys and provider-key patterns). No application credentials were configured. Reviewed returned build events contained no checked credential patterns. This is a bounded inspection, not a comprehensive security certification.
- **PASS:** instrumented navigation to dashboard, applications, Settings, Help, Resumes, PDF Tools and sign-in observed **zero mutation requests, browser runtime errors or server 5xx responses**. PDF/document journeys independently assert no uploads/writes. Synthetic application records stayed in isolated browser storage; no database was attached.
- **PASS:** Vercel runtime-error lookup and error/warning/fatal log query for the deployment's verification window found no runtime errors or matching logs.
- **PASS:** report formatting, diff whitespace and all four original moodboard hashes.

Tooling corrections: CLI `curl` argument handling failed before an application request, so browser access used the supported automation-cookie mechanism. The browser child process passed all 24 tests, but its wrapper exited nonzero during credential-cleanup handling. Cleanup was completed separately with corrected stdin handling and verified by reading project state; the successful browser suite was not rerun unnecessarily.

## Evidence and limitations

Local, ignored evidence: [browser results](../.fats-private/d1/browser.log), [deployment identity](../.fats-private/d1/deployment.json), [settings](../.fats-private/d1/project-settings.json), [runtime audit](../.fats-private/d1/runtime-audit.json), [final anonymous checks](../.fats-private/d1/protection-after-cleanup.json), [credential cleanup](../.fats-private/d1/cleanup.json), and [screenshots](../.fats-private/d1/SCREENSHOTS.md). Inspected actual hosted mobile status and dark PDF screenshots. Captures contain synthetic records only.

Accounts, verification/recovery delivery, server document library/storage/uploads, matching and hosted Sidekick capture remain unavailable under D0's boundaries. Some account/recovery copy still references local setup; no working hosted account is claimed. The existing PDF structural warnings and matching-plan unit regression remain separate. Full unit/lint suites were not rerun for this deployment without source changes. Physical-device, screen-reader and other-browser validation were not performed.

Guest data belongs to the exact browser origin: deployment and stable alias have separate storage. Use the stable URL consistently; export JSON before switching origins. No synthetic records were seeded into other users' browsers or a shared server database.

## Rollback and D2 readiness

Keep All Deployments protection enabled. This is the project's first deployment, so there is no previous known-good deployment to roll back to. To withdraw it, use Vercel's **Pause Project** action on `fats`; do not delete browser data or remove protection. To recover this version, redeploy the exact commit with the same D0 configuration and repeat anonymous/authorized smoke checks. For subsequent releases, reassign/roll back to this known-good deployment while retaining protection. There is no database migration to undo.

**Ready for a separately scoped D2; still not ready for public beta or hosted accounts.** D2 can build on this protected guest baseline. Custom-domain changes require separate authorization and origin-continuity handling. Hosted accounts still require the mail/provider decision, explicit remote migrations, pooler-compatible auth/erasure locks and hosted security/recovery checks identified in D0. Keep AI and scanner-dependent storage unavailable until their own approved work.
