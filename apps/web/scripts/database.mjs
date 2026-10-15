import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  DatabaseOperationError,
} from '../src/server/database-operations.ts';
import { FilesystemDocumentStorage } from '../src/server/document-storage.ts';
const [action, ...args] = process.argv.slice(2);
function option(name) {
  const index = args.indexOf('--' + name);
  return index >= 0 ? args[index + 1] : undefined;
}
try {
  const container = option('container'),
    database = option('database'),
    file = option('file');
  const connectionString =
    action === 'backup'
      ? process.env.DATABASE_URL
      : process.env.FATS_RESTORE_DATABASE_URL;
  if (
    !container ||
    !database ||
    !file ||
    !connectionString ||
    !['backup', 'restore'].includes(action)
  )
    throw new DatabaseOperationError(
      'Choose backup/restore, --container, --database, and --file. Restore requires a separately configured private FATS_RESTORE_DATABASE_URL; it never falls back to DATABASE_URL.',
    );
  const target = { container, database, connectionString };
  const manifest =
    action === 'backup'
      ? await createDatabaseBackup(
          target,
          file,
          process.env.FATS_DOCUMENTS_DIR
            ? new FilesystemDocumentStorage(process.env.FATS_DOCUMENTS_DIR)
            : undefined,
        )
      : await restoreDatabaseBackup(
          target,
          file,
          option('confirm'),
          args.includes('--check'),
          process.env.FATS_RESTORE_DOCUMENTS_DIR,
        );
  console.log(
    `PASS: ${action === 'backup' ? 'Private archive and manifest created' : args.includes('--check') ? 'Archive compatibility checked; no database changed' : 'Database restored transactionally; all sessions and pending tokens revoked'}. Target ${container}/${database}. ${manifest.counts.users} accounts, ${manifest.counts.applications} applications, ${manifest.counts.interviews} interviews, ${manifest.documents.length} verified document files.`,
  );
} catch (error) {
  console.error(
    error instanceof DatabaseOperationError
      ? error.message
      : 'Database operation failed. Keep the application stopped and retain the original archive. No private diagnostics were printed.',
  );
  process.exitCode = 1;
}
