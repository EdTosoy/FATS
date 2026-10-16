import type { Pool, PoolClient } from 'pg';
import { WorkspaceError } from './workspace-error.ts';
export async function requireAcceptedDocument(
  db: Pool | PoolClient,
  row: { user_id: string; storage_key: string; sha256: string },
) {
  if (
    !(
      await db.query(
        "SELECT 1 FROM document_objects WHERE user_id=$1 AND storage_key=$2 AND intake_state='accepted' AND accepted_sha256=$3",
        [row.user_id, row.storage_key, row.sha256],
      )
    ).rowCount
  )
    throw new WorkspaceError(
      'This file needs safety verification before it can be opened or used. Ask the local operator to recheck it. Its metadata and history are preserved.',
      409,
    );
}
