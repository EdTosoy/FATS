import {
  validateWorkspaceData,
  workspaceCounts,
  type WorkspaceData,
  type WorkspaceCounts,
  type RestorePreview,
} from './backup';

export class LocalMigrationError extends Error {}

export interface LocalMigrationPreview extends RestorePreview {
  added: WorkspaceCounts;
  identical: WorkspaceCounts;
  alreadyImported: boolean;
}
// Additive only: never overwrite a changed record that shares a legacy ID.
export function planLocalMigration(source: unknown, current: unknown) {
  const incoming = validateWorkspaceData(source);
  const saved = validateWorkspaceData(current);
  function additions<T extends { id: string }>(rows: T[], existing: T[]): T[] {
    const byId = new Map(existing.map((row) => [row.id, row]));
    return rows.filter((row) => {
      const match = byId.get(row.id);
      if (!match) return true;
      if (JSON.stringify(match) !== JSON.stringify(row))
        throw new LocalMigrationError(
          'A browser record conflicts with an account record using the same ID. Nothing was copied. Export both workspaces before resolving the conflict.',
        );
      return false;
    });
  }
  const data: WorkspaceData = {
    applications: additions(incoming.applications, saved.applications),
    interviews: additions(incoming.interviews, saved.interviews),
  };
  const added = workspaceCounts(data);
  return {
    data,
    added,
    identical: {
      applications: incoming.applications.length - added.applications,
      interviews: incoming.interviews.length - added.interviews,
    },
  };
}
