# Offer Desk

Offer Desk is a non-AI continuation of an application for fresh graduates and first-time job seekers. Start with the date an offer arrived, keep unknown details blank, review useful questions, and record the decision communicated to the employer. FATS never contacts the employer, accepts a contract, or signs a document.

## Using it

1. Open an existing application and manually choose the **Offer** stage. Offer Desk appears in that application, with no new navigation item or financial dashboard.
2. Choose **Record offer**. Only the received date is required. Optional disclosure groups hold gross salary/currency/frequency and benefits; employment/work details and dates; and contract notes plus an exact document version. PHP and Asia/Manila are editable defaults, not inferred compensation or location.
3. Review the ten checklist topics. Each can be Not reviewed, Reviewed, or Need to clarify. Save questions for HR. The checklist is guidance, not legal advice or contract validation, and never blocks a decision.
4. Upload an offer letter or contract through the existing private document library, under Other application documents if appropriate. Return and record revised terms selecting the exact library version. Existing PDF preview and PDF/DOCX download endpoints enforce live account ownership. No file bytes are copied when linking.
5. Add dated negotiation notes and record complete revised terms. The original and every revision remain accessible with their own document-version link. A later upload, archive, or rename never switches an earlier letter.
6. Record acceptance, decline, or confirmed employer withdrawal using a dated confirmation form and optional notes. **Continue reviewing** records a correction/reopening without deleting prior decisions. Record revisions/negotiation while reviewing; reopen a resolved process before correcting terms or attaching another letter.

The application’s seven manual recruitment stages remain separate from the offer decision. “Offer” means the application reached that stage; acceptance is shown as **Acceptance recorded** inside Offer Desk. Recording a decision changes neither application status nor any interview. Users remain free to correct the manual application stage, and an existing offer stays visible after that change. Only one offer process exists per application, including its decision history.

Offer Desk requires a verified signed-in account, consistent with private documents. Guests at the Offer stage receive a sign-in explanation. Their local applications are never silently transferred; the existing Settings transfer previews and confirms the additive account transfer. No offer terms or documents are stored in localStorage. This milestone does not expand the guest backup schema.

## Dates, deadlines, and money

Received, entry, decision, start, and response dates are ISO calendar dates. Each terms revision records an explicit IANA timezone; the initial default is Asia/Manila. Deadlines are date-only: they remain due for the whole chosen local calendar day. FATS does not guess an employer’s exact cutoff time. Ask HR when that matters. Recording timestamps are separate server UTC instants. History is ordered by recording sequence, with manually entered occurrence dates displayed, so a backdated correction cannot silently become an older “current” revision.

Deadline awareness uses the latest terms of reviewing processes, refreshes while the app is open and on focus, and appears on the application and dashboard. Today, tomorrow, and the next three calendar days use a calm approaching indicator; passed dates say to check with HR. A passed deadline never changes offer state. Resolved offers retain their recorded deadline but leave the dashboard response list. There are no notifications, workers, jobs, or email reminders.

Gross salary is a validated decimal **string**, with up to 14 whole digits and four decimal places. Empty means unknown; zero is distinct. Trailing fractional zeros are normalized using string operations. No salary passes through JavaScript Number, floating-point arithmetic, currency conversion, annualization, tax estimation, or inferred comparisons. A three-letter currency code defaults to PHP; frequency may remain unspecified. Amounts display exactly rather than being rounded by a currency formatter.

## Domain and persistence choices

`libs/domain/src/offer.ts` contains shared types, input validation, checklist constants, exact amount normalization, latest-term selection, and timezone-aware deadline selectors without UI or database imports.

Migration `0006_offers.sql` adds two owner-scoped tables using the existing parameterized pg architecture:

- `offers`: one `(user_id, application_id)` header with current state, checklist, HR questions, and integer version.
- `offer_events`: immutable, bounded individual history entries for terms, negotiation, decisions, and review saves. Terms are full validated JSON snapshots; the optional `version_id` has an owner-scoped foreign key to the existing immutable document version. A SQL check keeps that ID consistent with the terms snapshot. Review saves also retain their checklist/questions snapshot in SQL.

This is a small current-record plus history design, with no generalized workflow framework, replay mechanism, ORM, or new dependency. Only the current checklist/questions are exposed in the UI; older review snapshots are retained for complete operator recovery. Historical terms and decisions are visible.

The Node-only same-origin `/api/offers` endpoint derives ownership from a live, uncached Better Auth session, requires verified email, checks stale-account headers, validates bounded JSON, and never accepts client ownership fields. All queries include server-derived ownership; composite foreign keys prevent cross-account application/document links. Responses are private and uncached. Notes are plain text. Errors suppress SQL, credentials, and document contents.

Each mutation takes the existing per-owner workspace row lock, validates the expected offer version, and commits header, immutable history entry, and workspace revision together. A stale editor receives HTTP 409 and keeps its draft; explicitly reload the saved version and compare before retrying. A UUID request ID plus canonical command fingerprint deduplicates identical retries, including a lost commit response; reusing an ID for different details is rejected. The form keeps its request ID for an unchanged retry. The existing document-backup advisory lock coordinates offer mutations with full archives. Reads aggregate headers/history in one consistent SQL statement.

## Preservation and recovery

Application deletion and JSON replacement are blocked when offer history would be lost. Referenced documents cannot be deleted, even after a later revision removes the current letter; archive preserves retrieval. Corrections append entries. There is deliberately no offer-history deletion control. New owner references cascade through the existing account lifecycle, with child history cascading from its offer; existing private-document deletion restrictions still apply. FATS does not add a public account-deletion endpoint in this milestone.

Settings JSON remains version 1 and exports applications/interviews only. Its explanation now explicitly excludes Offer Desk. It is **not** a complete offer backup. Restore preview and confirmation both guard existing offers, including an offer added after preview. Additive guest transfer continues to preserve offers.

Full local recovery uses the existing operator PostgreSQL archive, checksum/migration manifest, and matching immutable private-file bundle. The table allowlist now recognizes both offer tables. Recovery preserves exact headers, review state, history entries, request fingerprints, and document IDs; existing byte inventory checks and session/recovery revocation apply. Follow [DATABASE_RECOVERY.md](DATABASE_RECOVERY.md); never restore into a user database as a test. Apply migrations explicitly before starting an updated local account server. No development/user database is migrated by feature tests.

## Deliberate limits

One exact letter/contract version may be linked per terms revision; earlier revision links remain available. Uploading uses the existing library page rather than an inline uploader. Formats, quotas, immutable versions, health warnings, and malware-scanning limitations remain those of [DOCUMENTS.md](DOCUMENTS.md). Unsaved drafts survive failed saves while mounted, not navigation/reload. There is no offline offer mode, autosave, hard-time deadline, negotiation email, legal analysis, salary recommendation, signing, PDF editing, generalized contract management, Career Vault, or production deployment. All AI development and live-provider evaluation remain paused.

For actual executed checks and remaining verification limits, see [OFFER_DESK_VERIFICATION.md](OFFER_DESK_VERIFICATION.md). A useful next separately scoped non-AI milestone is a clearly labeled, portable **Offer Desk export** with a safe restore preview, so users can recover offer history without operator tooling; preserve private-file ownership and exact version references.

Implementation reused installed Next.js 16.4.0 route-handler guidance at `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and the repository’s existing Radix, PostgreSQL, document, auth, and recovery paths. No new framework API or external service was introduced.
