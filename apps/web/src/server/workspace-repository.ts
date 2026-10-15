import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  createApplication,
  updateApplication,
  createInterview,
  updateInterview,
  upcomingInterviews,
  createBackup,
  serializeBackup,
  parseBackup,
  validateWorkspaceData,
  workspaceCounts,
  validateJobCapture,
  canonicalPostingUrl,
  normalizeApplicationInput,
  planLocalMigration,
  type WorkspaceRepository,
  type WorkspaceData,
  type JobApplication,
  type Interview,
  type ApplicationInput,
  type ApplicationStatus,
  type InterviewInput,
  type InterviewStatus,
  type JobCapture,
  type RestorePreview,
  type LocalMigrationPreview,
} from '@fats/domain';

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}
const APP_FIELDS = [
  'id',
  'title',
  'company',
  'sourceUrl',
  'location',
  'description',
  'status',
  'createdAt',
  'updatedAt',
] as const;
const INTERVIEW_FIELDS = [
  'id',
  'applicationId',
  'title',
  'stage',
  'scheduledAt',
  'timeZone',
  'meetingUrl',
  'location',
  'preparationNotes',
  'reflections',
  'status',
  'createdAt',
  'updatedAt',
] as const;
type Table = 'applications' | 'interviews';
function dates(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  );
}
function databaseData(data: WorkspaceData) {
  if (
    [...data.applications, ...data.interviews].some(
      (row) => row.id.length > 256,
    )
  )
    throw new WorkspaceError(
      'A record ID exceeds the account database limit of 256 characters. Keep the original backup and request recovery help.',
    );
  return data;
}
function fingerprint(data: WorkspaceData) {
  const sorted = {
    applications: [...data.applications].sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    interviews: [...data.interviews].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

// Only the server creates this adapter, with an owner derived from a live session.
export class PostgresWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly pool: Pool,
    private readonly owner: string,
  ) {}
  private async transaction<T>(
    write: boolean,
    run: (client: PoolClient, revision: string) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query(
        'INSERT INTO workspaces(user_id) VALUES($1) ON CONFLICT DO NOTHING',
        [this.owner],
      );
      const { rows } = await client.query(
        'SELECT revision FROM workspaces WHERE user_id=$1 FOR UPDATE',
        [this.owner],
      );
      const result = await run(client, String(rows[0].revision));
      if (write)
        await client.query(
          'UPDATE workspaces SET revision=revision+1 WHERE user_id=$1',
          [this.owner],
        );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async read(client: PoolClient): Promise<WorkspaceData> {
    const [apps, interviews] = await Promise.all([
      client.query(
        'SELECT * FROM applications WHERE user_id=$1 ORDER BY "updatedAt" DESC, id',
        [this.owner],
      ),
      client.query(
        'SELECT * FROM interviews WHERE user_id=$1 ORDER BY "scheduledAt", id',
        [this.owner],
      ),
    ]);
    return validateWorkspaceData({
      applications: apps.rows.map(dates),
      interviews: interviews.rows.map(dates),
    });
  }
  async getWorkspace(): Promise<WorkspaceData> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const data = await this.read(client);
      await client.query('COMMIT');
      return data;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async insert(
    client: PoolClient,
    table: Table,
    row: JobApplication | Interview,
  ) {
    const fields = table === 'applications' ? APP_FIELDS : INTERVIEW_FIELDS;
    const values = fields.map(
      (key) => (row as unknown as Record<string, string>)[key],
    );
    await client.query(
      `INSERT INTO ${table}(user_id,${fields.map((key) => `"${key}"`).join(',')}) VALUES(${[this.owner, ...values].map((_, i) => `$${i + 1}`).join(',')})`,
      [this.owner, ...values],
    );
  }
  private async replace(
    client: PoolClient,
    table: Table,
    row: JobApplication | Interview,
  ) {
    const fields = (
      table === 'applications' ? APP_FIELDS : INTERVIEW_FIELDS
    ).filter((key) => key !== 'id' && key !== 'createdAt');
    const values = fields.map(
      (key) => (row as unknown as Record<string, string>)[key],
    );
    await client.query(
      `UPDATE ${table} SET ${fields.map((key, i) => `"${key}"=$${i + 3}`).join(',')} WHERE user_id=$1 AND id=$2`,
      [this.owner, row.id, ...values],
    );
  }
  async list() {
    return (await this.getWorkspace()).applications;
  }
  async listInterviews(applicationId?: string) {
    const data = (await this.getWorkspace()).interviews;
    return applicationId === undefined
      ? data
      : data.filter((row) => row.applicationId === applicationId);
  }
  async upcomingInterviews(now: string) {
    return upcomingInterviews(await this.listInterviews(), now);
  }
  async create(input: ApplicationInput, id: string = randomUUID()) {
    const row = createApplication(input, id, new Date().toISOString());
    return this.transaction(true, async (client) => {
      const existing = (await this.read(client)).applications.find(
        (record) => record.id === id,
      );
      if (existing) return existing;
      await this.insert(client, 'applications', row);
      return row;
    });
  }
  async createCapturedApplication(
    capture: JobCapture,
    input: ApplicationInput,
  ) {
    const valid = validateJobCapture(capture, new Date().toISOString());
    const normalized = normalizeApplicationInput(input);
    return this.transaction(true, async (client) => {
      const data = await this.read(client);
      const existing = data.applications.find(
        (row) =>
          row.id === valid.id ||
          canonicalPostingUrl(row.sourceUrl) ===
            canonicalPostingUrl(normalized.sourceUrl),
      );
      if (existing) return existing;
      const row = createApplication(
        normalized,
        valid.id,
        new Date().toISOString(),
      );
      await this.insert(client, 'applications', row);
      return row;
    });
  }
  async update(
    id: string,
    input: ApplicationInput & { status: ApplicationStatus },
  ) {
    return this.transaction(true, async (client) => {
      const existing = (await this.read(client)).applications.find(
        (row) => row.id === id,
      );
      if (!existing) throw new WorkspaceError('Application not found.', 404);
      const row = updateApplication(existing, input, new Date().toISOString());
      await this.replace(client, 'applications', row);
      return row;
    });
  }
  async deleteApplication(id: string) {
    return this.transaction(true, async (client) => {
      const data = await this.read(client);
      if (!data.applications.some((row) => row.id === id))
        throw new WorkspaceError('Application not found.', 404);
      if (data.interviews.some((row) => row.applicationId === id))
        throw new WorkspaceError(
          'Keep this application while interviews are linked to it.',
          409,
        );
      if (
        (
          await client.query(
            'SELECT 1 FROM application_document_versions WHERE user_id=$1 AND application_id=$2',
            [this.owner, id],
          )
        ).rowCount
      )
        throw new WorkspaceError(
          'Keep this application while a submitted resume version is linked to it. Explicitly remove the link first.',
          409,
        );
      await client.query(
        'DELETE FROM applications WHERE user_id=$1 AND id=$2',
        [this.owner, id],
      );
    });
  }
  async createInterview(input: InterviewInput, id: string = randomUUID()) {
    const row = createInterview(input, id, new Date().toISOString());
    return this.transaction(true, async (client) => {
      const data = await this.read(client);
      const existing = data.interviews.find((record) => record.id === id);
      if (existing) return existing;
      if (!data.applications.some((app) => app.id === row.applicationId))
        throw new WorkspaceError('Choose an application in your account.', 404);
      await this.insert(client, 'interviews', row);
      return row;
    });
  }
  async updateInterview(
    id: string,
    input: InterviewInput & { status: InterviewStatus },
  ) {
    return this.transaction(true, async (client) => {
      const data = await this.read(client);
      const existing = data.interviews.find((record) => record.id === id);
      if (!existing) throw new WorkspaceError('Interview not found.', 404);
      if (!data.applications.some((app) => app.id === input.applicationId))
        throw new WorkspaceError('Choose an application in your account.', 404);
      const row = updateInterview(existing, input, new Date().toISOString());
      await this.replace(client, 'interviews', row);
      return row;
    });
  }
  async deleteInterview(id: string) {
    return this.transaction(true, async (client) => {
      const result = await client.query(
        'DELETE FROM interviews WHERE user_id=$1 AND id=$2',
        [this.owner, id],
      );
      if (!result.rowCount)
        throw new WorkspaceError('Interview not found.', 404);
    });
  }
  async exportBackup() {
    return serializeBackup(
      createBackup(await this.getWorkspace(), new Date().toISOString()),
    );
  }
  private async preview(
    text: string,
    kind: 'restore' | 'migration',
  ): Promise<LocalMigrationPreview> {
    const backup = parseBackup(text);
    const data = databaseData(backup.data);
    const hash = fingerprint(data);
    return this.transaction(false, async (client, revision) => {
      const current = await this.read(client);
      if (kind === 'restore') await this.requireNoDocumentLinks(client);
      const alreadyImported =
        kind === 'migration' &&
        !!(
          await client.query(
            'SELECT 1 FROM local_migrations WHERE user_id=$1 AND fingerprint=$2',
            [this.owner, hash],
          )
        ).rowCount;
      const plan =
        kind === 'migration' && !alreadyImported
          ? planLocalMigration(data, current)
          : {
              added: { applications: 0, interviews: 0 },
              identical: workspaceCounts(data),
            };
      const token = randomUUID();
      await client.query(
        'DELETE FROM workspace_stages WHERE user_id=$1 AND "expiresAt" < now()',
        [this.owner],
      );
      await client.query(
        `INSERT INTO workspace_stages(token,user_id,kind,data,base_revision,fingerprint,"exportedAt","expiresAt")
        VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '15 minutes')`,
        [
          token,
          this.owner,
          kind,
          JSON.stringify(data),
          revision,
          hash,
          backup.exportedAt,
        ],
      );
      return {
        token,
        exportedAt: backup.exportedAt,
        incoming: workspaceCounts(data),
        current: workspaceCounts(current),
        added: plan.added,
        identical: plan.identical,
        alreadyImported,
      };
    });
  }
  private async requireNoDocumentLinks(client: PoolClient) {
    if (
      (
        await client.query(
          'SELECT 1 FROM application_document_versions WHERE user_id=$1 LIMIT 1',
          [this.owner],
        )
      ).rowCount
    )
      throw new WorkspaceError(
        'JSON backups do not contain documents or submitted resume links. Export your records, then explicitly remove those links before replacing applications. Use a complete operator archive to recover documents and links.',
        409,
      );
  }
  async previewRestore(text: string): Promise<RestorePreview> {
    return this.preview(text, 'restore');
  }
  async previewMigration(text: string) {
    return this.preview(text, 'migration');
  }
  private async apply(token: string, kind: 'restore' | 'migration') {
    return this.transaction(true, async (client, revision) => {
      const { rows } = await client.query(
        'SELECT * FROM workspace_stages WHERE user_id=$1 AND token=$2 AND kind=$3',
        [this.owner, token, kind],
      );
      const stage = rows[0];
      if (!stage)
        throw new WorkspaceError(
          'This preview is unavailable. Preview the data again.',
          404,
        );
      if (stage.applied) return this.read(client);
      if (new Date(stage.expiresAt).getTime() <= Date.now())
        throw new WorkspaceError(
          'This preview expired. Preview the data again.',
          409,
        );
      if (String(stage.base_revision) !== revision)
        throw new WorkspaceError(
          'Your account changed since preview. Preview again before continuing.',
          409,
        );
      const incoming = databaseData(validateWorkspaceData(stage.data));
      const current = await this.read(client);
      if (kind === 'restore') {
        await this.requireNoDocumentLinks(client);
        await client.query('DELETE FROM interviews WHERE user_id=$1', [
          this.owner,
        ]);
        await client.query('DELETE FROM applications WHERE user_id=$1', [
          this.owner,
        ]);
        for (const row of incoming.applications)
          await this.insert(client, 'applications', row);
        for (const row of incoming.interviews)
          await this.insert(client, 'interviews', row);
      } else {
        const done = await client.query(
          'SELECT 1 FROM local_migrations WHERE user_id=$1 AND fingerprint=$2',
          [this.owner, stage.fingerprint],
        );
        if (!done.rowCount) {
          const plan = planLocalMigration(incoming, current);
          for (const row of plan.data.applications)
            await this.insert(client, 'applications', row);
          for (const row of plan.data.interviews)
            await this.insert(client, 'interviews', row);
          await client.query(
            'INSERT INTO local_migrations(user_id,fingerprint) VALUES($1,$2)',
            [this.owner, stage.fingerprint],
          );
        }
      }
      await client.query(
        'UPDATE workspace_stages SET applied=true WHERE user_id=$1 AND token=$2',
        [this.owner, token],
      );
      return this.read(client);
    });
  }
  async restoreBackup(token: string) {
    return this.apply(token, 'restore');
  }
  async migrateLocal(token: string) {
    return this.apply(token, 'migration');
  }
  cancelRestore(token: string) {
    void this.cancelStage(token).catch(() => {});
  }
  async cancelStage(token: string) {
    await this.pool.query(
      'DELETE FROM workspace_stages WHERE user_id=$1 AND token=$2 AND NOT applied',
      [this.owner, token],
    );
  }
}
