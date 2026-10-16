import { Pool } from 'pg';
import { recoverDataLifecycle } from '../src/server/account-erasure.ts';
import { FilesystemDocumentStorage } from '../src/server/document-storage.ts';
if (!process.env.DATABASE_URL || !process.env.FATS_DOCUMENTS_DIR) {
  console.error('Configure DATABASE_URL and private FATS_DOCUMENTS_DIR.');
  process.exitCode = 1;
} else {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  try {
    const result = await recoverDataLifecycle(
      pool,
      new FilesystemDocumentStorage(process.env.FATS_DOCUMENTS_DIR),
    );
    console.log(JSON.stringify(result));
    if (result.pendingAccounts || result.pendingFiles) process.exitCode = 1;
  } catch {
    console.error(
      'Data cleanup is incomplete. Check database and private storage access, then retry. No private details were printed.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
