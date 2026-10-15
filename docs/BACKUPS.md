# Local backups and recovery

For operator PostgreSQL archives covering all accounts and authentication material, use the separate [database recovery runbook](DATABASE_RECOVERY.md). This document describes user-level JSON exports. Both remain available in Phase 4.1; restoring a database also revokes sessions/recovery tokens, while JSON restores affect only the selected workspace's records.

## Account workspaces (Phase 4)

Settings exports/restores the active workspace: PostgreSQL account records when signed in, browser records when signed out. Both use the version 1 format below and exclude credentials/sessions. Account export and restore use the same-origin FATS API; downloaded files are still private and unencrypted. Sign out to access a separate local workspace or its recovery tools. The browser-only details below apply to guest mode.

Account restore stages a validated snapshot on the server for 15 minutes. Preview shows incoming/current counts; confirmation replaces both account collections in one database transaction. Owner-bound tokens and a workspace revision reject another account, stale previews, and expired previews. Failure rolls back the replacement. Retrying an already-applied stage returns current records without replacing them again. Expired stages are removed opportunistically on later previews. Export current records first and keep your backup file until reload confirms recovery.

The separate **Preview browser transfer** workflow is additive, keeps existing account records, and never deletes/rewrites local data. Identical IDs/content are skipped; conflicting IDs stop the transfer. A durable account/snapshot fingerprint prevents repeated imports after interrupted responses. A snapshot already transferred is not automatically reapplied after later account edits or restores; use deliberate backup replacement to recover an old snapshot. IDs up to 256 characters are retained; longer legacy IDs need assisted recovery before transfer. The account schema retains original text, including surrounding whitespace, while shared validation still enforces the version 1 rules.

In **Settings → Data management**, export a JSON backup before clearing browser data or replacing a workspace. The file contains applications, interviews, preparation notes, and reflections. It does not contain resume documents, brand assets, other browser storage, accounts, or unsaved form drafts.

Backups are private, **unencrypted** files. Anyone who can read the file can read its contents. Keep it in a safe place; FATS does not upload it or sync it to a cloud service. The download message confirms that a download was requested, not that a file was durably saved by the browser. Check your downloads.

## Version 1 format

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

The backup format/version is independent of the internal `fats.applications.v1` storage envelope. Raw local-storage JSON is not a backup file. Future format migrations belong at `parseBackup`'s version boundary; no migration or version guessing is implemented now. Unsupported versions are rejected with guidance.

Both arrays are required in a backup. Applications keep their IDs, titles, companies, source URLs, locations, descriptions, recruitment statuses, and creation/update timestamps. Interviews keep IDs, application IDs, titles, stages, UTC scheduled instants, IANA timezones, meeting URLs, locations, interview statuses, preparation notes, reflections, and creation/update timestamps. All timestamps must be canonical UTC ISO strings (`YYYY-MM-DDTHH:mm:ss.sssZ`). Original record identifiers are retained; they are not regenerated or required to be UUIDs for compatibility with existing records.

Validation reuses the domain's application/interview rules, checks text types, timestamps, statuses, duplicate IDs within each collection, safe HTTP(S) URLs, and parent relationships. Only documented fields are copied; unknown fields are ignored and never restored/exported. Valid original text, including note spacing and line breaks, is preserved exactly. Schema validity does not authenticate the author or prove that a backup has not been edited. Import only files you intend to trust.

Files are limited to 10 MiB of UTF-8 JSON. Export applies the same limit so every generated backup can be read by this version. A valid backup may still exceed the browser's available storage quota; in that case restore fails without replacing the saved data.

## Safe full replacement

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
