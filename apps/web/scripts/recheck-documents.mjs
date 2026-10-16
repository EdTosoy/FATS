import { Pool } from 'pg';
import { FilesystemDocumentStorage } from '../src/server/document-storage.ts';
import { recheckDocuments } from '../src/server/document-recheck.ts';
if (!process.env.DATABASE_URL || !process.env.FATS_DOCUMENTS_DIR) {
  console.error(
    'Configure DATABASE_URL and the matching private FATS_DOCUMENTS_DIR.',
  );
  process.exitCode = 1;
} else {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  try {
    const result = await recheckDocuments(
      pool,
      new FilesystemDocumentStorage(process.env.FATS_DOCUMENTS_DIR),
    );
    console.log(JSON.stringify(result));
    if (result.pending) process.exitCode = 1;
  } catch {
    console.error(
      'Document rechecking is incomplete. Check local scanner, isolation runtime and private storage. No document contents were printed.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
