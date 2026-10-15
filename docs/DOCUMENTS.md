# Private resumes and documents — Phase 5

Documents are available only in verified account workspaces. Guest applications, interviews, backups, and Sidekick remain available. A file stored here is never sent to an employer. Maria remains the labelled guest sample; no documents are seeded.

## Local setup

Run the existing PostgreSQL migrations before starting FATS. New `db:configure` files include `FATS_DOCUMENTS_DIR`. For an existing private `apps/web/.env.local`, add an absolute, canonical path to a persistent directory, for example:

```dotenv
FATS_DOCUMENTS_DIR=/absolute/private/path/fats-documents
```

The application creates this directory as mode 0700 and files as 0600. Existing directories must have those private permissions. Symlinked roots/ancestors and paths containing `public`, `.next`, or `node_modules` are refused. Keep it outside any web server's served directories. Do not point it at temporary storage for normal use. Restart FATS after configuration, then open Resumes. A missing configuration produces an actionable library error; it does not break application/interview storage. The filesystem adapter targets the local Linux/Node 24 environment. No S3 account, bucket, or cloud deployment is needed.

## Library and submitted history

Upload PDF/DOCX files into Resumes, Cover letters, Certificates, or Other application documents. Search covers document names and original filenames; category and active/archive filters combine with search. Open a document to rename it, change its category, view version history, add a version, choose/clear the default resume, archive/restore, preview PDFs, or download an exact version. DOCX files are downloaded for local viewing.

The latest version is the highest version number. The default resume is an explicitly chosen active resume document; its latest version is current. There is no automatic submitted version or automatic default selection. Application details require both a resume and a specific version, followed by **Record submitted version**. Changing or removing that association is explicit. New versions, renaming, changing the default, and archiving never alter an existing submitted version ID. Archived submitted files remain downloadable. A linked document cannot be deleted or moved out of the Resumes category. Unlinked deletion requires confirmation and deletes all its versions; individual version deletion is deliberately unavailable.

Limits include archived files and all previous versions:

| Limit                 | Value                                  |
| --------------------- | -------------------------------------- |
| File                  | Nonempty, at most 10 MiB               |
| Account               | 100 MiB of referenced file content     |
| Documents per account | 50                                     |
| Versions per document | 20                                     |
| PDF pages             | 1–500                                  |
| DOCX ZIP entries      | At most 500                            |
| DOCX inflated content | At most 20 MiB per entry, 40 MiB total |

## Storage and authorization

`libs/domain/src/document.ts` defines UI-independent entities, categories, limits, and metadata validation. Migration `0004_documents.sql` adds `documents`, `document_versions`, `application_document_versions`, and a durable deletion queue. Existing migrations remain unchanged. Composite foreign keys include `user_id` for document/version/application references. A partial unique index permits one default resume per owner; a trigger rejects version metadata updates. Versions retain original filenames, format, size, SHA-256, sequential number, and creation instant. Document and association updates record timestamps. Storage keys remain server-only.

The Node `/api/documents` boundary derives ownership from Better Auth's live, verified session. Every SQL read/write is owner-scoped. The account header detects stale tabs and never grants ownership. Downloads and previews repeat session/ownership checks. Writes require exact Host/Origin, and cross-site fetches are refused. Uploads use a bounded raw byte stream plus a bounded, encoded JSON metadata header; cookies and filenames are never placed in URLs. Browser MIME types have no authority. No document bytes or account document metadata are stored in localStorage.

`DocumentStorage` exposes private put/read/remove operations on opaque UUID keys. `FilesystemDocumentStorage` implements it without returning storage paths to clients. A future S3-compatible adapter must preserve exclusive immutable puts, bounded integrity-checked reads, private objects, and deletion/recovery semantics; public or presigned object access is not implemented.

The local adapter writes an exclusive 0600 temporary file, syncs it, publishes with an exclusive hard link, and syncs the directory. It never overwrites an existing object. No metadata is inserted until the complete file is durable. Account workspace row locks serialize quota checks/version allocation and associations. Retrying the same upload request ID returns its original version; conflicting reuse fails. A new file selection generates a new request ID. Ambiguous/lost commit responses never trigger byte deletion. Failed/interrupted writes can leave private partial or unreferenced objects, which are not visible as complete documents.

Deletion first verifies no application references, then transactionally removes metadata and queues the keys. Only durable queue entries permit physical cleanup. Filesystem failure retains queue entries for retry; later document deletion retries pending cleanup. A read-only operator audit reports pending entries, private partials, and unreferenced objects. No automatic age-based deletion risks committed files. The 100 MiB quota measures live metadata, so retained orphan/queued files can consume additional disk space; the local operator must monitor free disk space. There is no background garbage collector or global disk quota.

## Validation and preview

PDF signature/end marker, structure, page count, encryption, and active/embedded action names are checked using pinned pdf-lib 1.17.1 in a native Node worker with a five-second timeout and V8 heap/stack limits. Standard unencrypted PDF 1.0–1.7 is supported. PDF 2.0, active actions, attachments, and forms with XFA are rejected. V8 heap limits do not cap every native/external allocation.

DOCX validation checks classic ZIP headers/directory consistency, safe unique entry names, size limits, supported stored/deflate methods, bounded actual decompression, CRCs, required Open XML parts/content types/relationships, and namespace-aware XML with saxes 6.0.0. DTD/entities, macro declarations, ActiveX, and embedded objects are rejected. Files are never extracted to disk or rendered as HTML. ZIP64, encrypted archives, unsupported XML encodings, and strict-namespace OOXML variants are outside this initial format subset. fflate 0.8.2 is development-only, for generating test fixtures.

These are format and isolation controls, not antivirus or content-disarm certification. Downloads use attachment disposition with a safe fallback and encoded original filename, exact MIME, no-store/private, nosniff, same-origin resource policy, and a sandbox CSP. PDF previews use locally bundled PDF.js 6.4.299 to paint canvas pixels from authenticated, integrity-checked bytes. No HTML, annotation, attachment, XFA, or document scripting layer is enabled. Rendering has time/image/canvas bounds; the original download remains available for selectable text and unsupported rendering features. PDF.js 6 no longer exposes the historical `isEvalSupported` option; the installed build does not contain dynamic eval/Function rendering. No document-derived HTML is inserted into the page. The preview uses system fonts and disables font-face loading and WebAssembly; some complex fonts/image encodings may need the original download.

## Integrity and recovery

Every library read and download checks file size and SHA-256. Missing, changed, or unreadable bytes preserve metadata/history and show recovery guidance; unavailable versions cannot be newly associated. Hashes detect accidental corruption, not malicious changes to both metadata and files. A private local operator can run:

```sh
pnpm documents:check
```

The audit prints aggregate counts only and exits unsuccessfully for missing/corrupt/unavailable referenced bytes. It never removes files or prints names, paths, keys, document content, or credentials. Keep the application stopped for an authoritative inventory; a live audit can observe concurrent changes. Interrupted uploads may leave partial/unreferenced files; retain and inspect them privately against a stopped database before any separately authorized manual cleanup.

Settings JSON exports retain version 1 and include applications/interviews only. They exclude document metadata, bytes, and submitted links. JSON replacement is blocked while submitted links exist, including links added since preview; explicitly removing links permits replacement while the library remains intact. An additive browser transfer remains supported.

Complete local recovery uses the PostgreSQL archive, its version 2 manifest, and its matching `.dump.documents/` directory. Backup holds a global advisory lock excluding document mutations, exports one database snapshot, and copies/verifies every referenced immutable file. Missing/unreadable/corrupt content fails the backup. A database with documents cannot be backed up through this tool without a configured byte store. Restore verifies the complete bundle, requires an independently selected fresh directory and database target, copies verified bytes first, and transactionally restores metadata/relationships/auth state. Files are retained after a database restore attempt, even on error, because a lost commit response is ambiguous. Keep the application stopped and inspect the database before choosing a fresh target for retry. See [the recovery runbook](DATABASE_RECOVERY.md). A successful local drill does not establish off-device or hosted disaster recovery.

Phase 6 adds optional [explainable comparison](MATCHING.md) against a selected immutable resume version. Local extraction and external analysis require explicit actions; uploading alone triggers neither. Reports preserve their exact version even after later uploads, archive, or rename. Reports also restrict document deletion; delete those derived reports first, subject to existing submitted-link rules. JSON exports do not include reports/reviewed text. The full operator bundle covers them with referenced bytes. Comparison has stricter extraction limits than upload; scanned documents/OCR are unsupported.

Before external hosting, separately scope managed orphan cleanup, isolated extraction/malware scanning, off-device encryption, and recovery rehearsals. Editor/templates, rewriting, cloud, payments, calendar sync, notifications, new auth providers, and extension document capture remain excluded. Stop after Phase 6.

## Sources checked

Installed Next 16.4 route-handler guide, installed pdf-lib/parser source and types, and [PDFDocument](https://pdf-lib.js.org/docs/api/classes/pdfdocument) / [LoadOptions](https://pdf-lib.js.org/docs/api/interfaces/loadoptions); [OWASP file-upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html); [Node zlib source documentation](https://github.com/nodejs/node/blob/main/doc/api/zlib.md), including bounded decompression. Exact dependencies are pinned in the lockfile.

Canvas preview references: [PDF.js examples](https://mozilla.github.io/pdf.js/examples/index.html), [API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), and the installed 6.4.299 types/source.
