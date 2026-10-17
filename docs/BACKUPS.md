# JSON backups and recovery

## Career Vault — version 3

Accounts with vault history export `fats-backup` version 3: version 2 applications/interviews/offers plus `employments` containing current details and complete ordered employment/document-register snapshots. IDs, dates, timestamps, requests, tracking states and notes survive. Private bytes, complete library metadata, live file links, storage keys, ownership and scanner receipts are excluded. Each document snapshot has an empty `documentVersionId`; `documentReference` is provenance only, even when the destination owns a matching accepted UUID.

Settings preview shows employment/document counts, additions, identical records, conflicts and unavailable file references. Explicit confirmation uses one owner-locked transaction: add missing records, skip identical records and block all changes on conflict, stale/expired preview, invalid history, duplicate identity or missing parent. Employment/register history is never overwritten or merged. Existing links on skipped employments remain intact. Versions 1/2 retain their established meaning; version 1 replacement is additionally blocked whenever vault history exists, and version 2 additions preserve it. Guests reject version 3 instead of dropping records. Browser transfer remains version 1.

The 10 MiB JSON limit remains. Employment/year/notes metadata is private and unencrypted in downloaded JSON. Complete file recovery needs the operator archive and exact migration revision. See [Career Vault](CAREER_VAULT.md), [verification](CAREER_VAULT_VERIFICATION.md) and [operator recovery](DATABASE_RECOVERY.md). The retained version 1/2 sections below describe those formats; version 3 is selected when vault records exist.

Hardening 2 does not change the portable JSON format or add private files/scan evidence to exports. Restored/uploaded file copies must pass the fail-closed private intake process before becoming usable; an old document reference is never a scan result or authorization. Complete operator recovery now invalidates prior acceptance and requires explicit file rechecking. See [safe intake evidence](PRIVATE_BETA_HARDENING_2_VERIFICATION.md) and the recovery runbook. Actual scanner verification and real-data beta remain blocked.

For operator PostgreSQL archives covering all accounts and authentication material, use the separate [database recovery runbook](DATABASE_RECOVERY.md). This document describes user-level JSON exports. Both remain available in Phase 5; restoring a database also revokes sessions/recovery tokens, while JSON restores affect only the selected workspace's records.

## Account workspaces (Phase 4)

Settings exports/restores the active workspace: PostgreSQL account records when signed in, browser records when signed out. Accounts with Career Vault history export version 3. Without vault records, accounts with offers export version 2; workspaces without either history export version 1. All formats exclude credentials/sessions and private document bytes. Account export and restore use the same-origin FATS API; downloaded files are private and unencrypted. Sign out to access separate browser records. The browser-only details below apply to guest mode.

Account restore stages a validated snapshot for 15 minutes. Version 1 requires explicit replacement of applications/interviews, retaining the existing guards for offers, submitted resume links, and comparison reports. Version 2 adds missing applications, interviews, and offers, skips identical records, and blocks conflicting records; it never overwrites an existing decision. Preview shows the applicable behavior before confirmation. Owner-bound tokens and a workspace revision reject another account, stale previews, and expired previews. All imported collections commit in one transaction or roll back together. Retrying an already-applied token returns current records without replaying old history. Expired stages are removed opportunistically. Keep your backup file until reload confirms recovery.

The separate **Preview browser transfer** workflow is additive, keeps existing account records, and never deletes/rewrites local data. Identical IDs/content are skipped; conflicting IDs stop the transfer. A durable account/snapshot fingerprint prevents repeated imports after interrupted responses. A snapshot already transferred is not automatically reapplied after later account edits or restores; use deliberate backup replacement to recover an old snapshot. IDs up to 256 characters are retained; longer legacy IDs need assisted recovery before transfer. The account schema retains original text, including surrounding whitespace, while shared validation still enforces the version 1 rules.

In **Settings → Data management**, export a JSON backup before clearing browser data or replacing a workspace. The file contains applications, interviews, preparation notes, reflections, and (version 2) offer terms/revisions, review checklists, HR questions, negotiation notes, and decision history. It does not contain file bytes, recoverable document-version metadata, submitted resumes, brand assets, unrelated browser storage, accounts, sessions, AI reports, or unsaved drafts.

Backups are private, **unencrypted** files. Anyone who can read the file can read its contents. Keep it in a safe place; FATS does not upload it or sync it to a cloud service. The download message confirms that a download was requested, not that a file was durably saved by the browser. Check your downloads.

## Version 2: portable offers for verified accounts

This extends the same `fats-backup` format and Settings flow, not a separate backup system:

```json
{
  "format": "fats-backup",
  "version": 2,
  "exportedAt": "2026-10-16T08:00:00.000Z",
  "data": {
    "applications": [],
    "interviews": [],
    "offers": []
  }
}
```

Each offer belongs to an application included in the backup. Its header retains `applicationId`, `version`, `state`, `checklist`, and `questions`. Its `events` array preserves every terms revision, negotiation note, decision, and review save: `requestId`, consecutive `sequence`, `kind`, calendar `occurredOn`, canonical UTC `recordedAt`, `notes`, full `terms` or null, `decision` or null, and the `review` snapshot or null. Exact salary values remain decimal strings. Sequence order, original timestamps, and request identifiers survive restoration; nothing is regenerated or sorted by manually entered occurrence dates. Current state and review must match the validated history. Duplicate offers/requests, incomplete/reordered history, missing parents, invalid values, active document links, and embedded ownership are rejected.

Terms in portable JSON always have `documentVersionId: ""`. An entry may retain a `documentReference` UUID (or null) identifying the letter version originally associated with it. This is historical information **only**, not a recoverable file, authorization, or a live document relationship. JSON contains no PDF/DOCX bytes, storage keys, or complete document/version metadata. All new imported references remain unlinked, even if the destination already contains a similarly named file or matching UUID. FATS never guesses document identity or looks up another account's files. The preview lists affected applications/history entries and explains the unavailable letters. The recovered offer displays that explanation, with no manufactured download link. Original references survive a later export. Upload a copy through the existing private library and explicitly record a new terms revision to link its exact version; older history remains unchanged. Reopen a resolved process first if needed.

An identical offer already present is skipped, so its existing authorized file links stay intact. A conflicting offer is never merged or replaced. Review the conflict list and keep both backups while resolving differences; a changed decision is a conflict. The entire import is blocked until conflicts are resolved. Records absent from a version 2 file are kept. Confirming a repeat import adds no duplicate history. Version 2 is accepted only in a verified account's Data management; guests receive actionable sign-in guidance rather than an import that would drop offers. Browser transfer remains version 1 only.

### Preview and confirmation

1. Select the file and choose **Preview backup**. No application/interview/offer records are imported yet.
2. Review incoming/current application/interview counts, additions and identical records, offer counts, linked application names, revision counts, decisions, conflicts, and letter references unavailable from JSON.
3. Cancel/Escape to leave records untouched, or acknowledge the additive import and missing-letter limitation. **Import supported records** stays disabled while conflicts exist or confirmation is unchecked.
4. Confirm. The server checks the live verified owner, token, expiry, workspace revision, validated history and conflicts again, then commits additions and the applied token atomically. A failure leaves all saved records and the preview available for retry. An expired/stale preview requires a fresh preview.
5. Keep the file. Reload and check offers, questions, revisions, decisions, and interview/application relationships. JSON is not a complete document or account archive.

Migration `0007_portable_offers.sql` adds `source_version_id` to offer history solely for unlinked imported provenance. It has no document foreign key or access semantics, is immutable with the history entry, and is removed with that offer/account. Existing live `version_id` references, document ownership, archive/deletion restrictions, and operator recovery behavior remain unchanged. No new table, endpoint, dependency, or separate workflow system is added. See [Offer Desk design](OFFER_DESK.md) and [executed 1.1 verification](OFFER_DESK_1_1_VERIFICATION.md).

## Version 1 format (retained)

```json
{
  "format": "fats-backup",
  "version": 1,
  "exportedAt": "2026-10-15T00:00:00.000Z",
  "data": {
    "applications": [],
    "interviews": []
  }
}
```

The backup format/version is independent of the internal `fats.applications.v1` storage envelope. Raw local-storage JSON is not a backup file. `parseBackup` explicitly accepts versions 1 and 2 without guessing. Unsupported versions are rejected with guidance. Version 1 retains its original validated fields and replacement semantics.

Both arrays are required in a backup. Applications keep their IDs, titles, companies, source URLs, locations, descriptions, recruitment statuses, and creation/update timestamps. Interviews keep IDs, application IDs, titles, stages, UTC scheduled instants, IANA timezones, meeting URLs, locations, interview statuses, preparation notes, reflections, and creation/update timestamps. All timestamps must be canonical UTC ISO strings (`YYYY-MM-DDTHH:mm:ss.sssZ`). Original record identifiers are retained; they are not regenerated or required to be UUIDs for compatibility with existing records.

Validation reuses the domain's application/interview rules, checks text types, timestamps, statuses, duplicate IDs within each collection, safe HTTP(S) URLs, and parent relationships. Only documented fields are copied; unknown fields are ignored and never restored/exported. Valid original text, including note spacing and line breaks, is preserved exactly. Schema validity does not authenticate the author or prove that a backup has not been edited. Import only files you intend to trust.

Files are limited to 10 MiB of UTF-8 JSON. Export applies the same limit so every generated backup can be read by this version. A valid backup may still exceed the browser's available storage quota; in that case restore fails without replacing the saved data.

## Version 1: safe full replacement

1. Export the current workspace if it contains anything you want to keep.
2. Choose a JSON backup and select **Preview backup**. Selecting or previewing never writes to storage.
3. Review incoming application/interview counts and current counts to be replaced. Empty backups clearly warn that all current records will be removed.
4. Check the explicit replacement acknowledgment, then select **Replace workspace**. Cancel or Escape discards the preview without writing.
5. Wait for confirmation. Keep the backup file and reload to check your recovered workspace.

There is no merge. Existing records absent from the backup are removed after a successful, explicitly confirmed restore. The repository privately stages a validated, detached copy; UI code receives only counts, backup date, and an opaque confirmation token. Restore checks that the exact saved value still matches the preview, revalidates the staged records, serializes both collections, and calls `setItem` once. It never clears storage first or writes records individually. Provider state changes only after that write succeeds, and other tabs refresh through the existing storage event.

The [HTML Web Storage standard](https://html.spec.whatwg.org/multipage/webstorage.html#dom-storage-setitem) checks whether a value can be stored before changing the map. A failed browser write therefore leaves the previous value intact; no second write or rollback is needed. The preview comparison detects intervening changes, but it is not a cross-tab transaction or lock. Simultaneous writers can still race between the check and replacement. Avoid making edits in other tabs while restoring. Site-data deletion, browser/OS failure, or a lost backup file remains outside this guarantee.

## Unreadable existing storage

Malformed saved data is never silently erased. Export is disabled when it cannot produce a validated backup. A valid backup can still be previewed, with current counts shown as **Unreadable** and a warning about replacement. Before confirming, privately back up the original FATS storage value using browser developer tools; see Help. Explicit confirmation then permits recovery over that value. Invalid backups, cancelled previews, blocked reads, stale previews, and failed writes leave the raw value untouched.

Existing Phase 1 and Phase 2 storage keeps the same key/version. Phase 1 envelopes without interviews are still read as an empty interview collection without rewriting storage. Records generated by those phases already use the canonical timestamps now enforced by shared validation. Invalid manually edited timestamps are reported instead of being accepted through permissive date parsing.

The guest JSON workflow adds no backend or encryption. Account support is described above; neither format provides automatic/off-device backups, cloud sync, or rich documents.

## Phase 5 document boundary

Both JSON versions exclude private bytes and submitted resume links. Version 2 includes only the explicitly unlinked offer-letter reference described above. Neither is a full account/document backup. Version 1 account replacement is blocked while any submitted resume link or offer exists, both at preview and confirmation. To replace just applications/interviews, deliberately resolve submitted links; offer history cannot be erased through replacement. Version 2 additions can preserve existing documents/links without replacing parents. Additive browser migration remains available. To recover documents and links together, use the complete PostgreSQL/manifest/file bundle in [DATABASE_RECOVERY.md](DATABASE_RECOVERY.md). Never treat JSON, or a database dump without its matching document content, as full recovery.

## Phase 6 comparison boundary

JSON v1 also excludes comparison reports, reviewed/extracted text, analysis configuration, usage counters, and internal job-description revisions. Account replacement is blocked while reports exist, both at preview and confirmation, to preserve their exact application/job context. Explicitly delete reports and remove submitted links before a deliberate application/interview replacement. Exporting JSON does not back up reports first. The complete operator bundle preserves completed reports, reviewed source snapshots, usage, revisions, and referenced resume bytes; restore discards extraction previews and marks in-flight analyses interrupted without sending anything to a provider. See [matching privacy/retention](MATCHING.md) and [recovery](DATABASE_RECOVERY.md). Deleting a report locally does not remove it from an earlier private operator archive or from provider retention.
