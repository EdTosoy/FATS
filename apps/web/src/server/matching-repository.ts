import { requireAcceptedDocument } from './document-acceptance';
import { assertActiveAccount } from './account-lifecycle';
import { randomUUID, createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
  sourceSegments,
  validateMatchResult,
  MatchingValidationError,
  MAX_MATCHING_BYTES,
  type MatchingSources,
  type MatchPreview,
  type MatchingReport,
} from '@fats/domain';
import { WorkspaceError } from './workspace-repository';
import {
  verifiedDocumentBytes,
  type DocumentStorage,
} from './document-storage';
import { extractResume } from './resume-extraction';
import {
  ProviderError,
  type MatchingProvider,
  matchingLimits,
} from './matching-provider';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export class MatchingRepository {
  constructor(
    private readonly pool: Pool,
    private readonly owner: string,
    private readonly storage: DocumentStorage,
    private readonly provider: MatchingProvider | null,
    private readonly limits = matchingLimits(),
  ) {}
  private async tx<T>(run: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='5s'");
      await assertActiveAccount(client, this.owner, true);
      await client.query(
        'INSERT INTO workspaces(user_id) VALUES($1) ON CONFLICT DO NOTHING',
        [this.owner],
      );
      await client.query(
        'SELECT revision FROM workspaces WHERE user_id=$1 FOR UPDATE',
        [this.owner],
      );
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async application(client: PoolClient, id: string) {
    const { rows } = await client.query(
      'SELECT description,description_revision FROM applications WHERE user_id=$1 AND id=$2',
      [this.owner, id],
    );
    if (!rows.length) throw new WorkspaceError('Application not found.', 404);
    return rows[0];
  }
  async cleanup() {
    await this.tx(async (client) => {
      await client.query(
        'DELETE FROM matching_previews WHERE user_id=$1 AND expires_at<=now()',
        [this.owner],
      );
      await client.query(
        "UPDATE matching_reports SET status='failed',failure='interrupted',sources=NULL WHERE user_id=$1 AND status='running' AND created_at<now()-interval '5 minutes'",
        [this.owner],
      );
      await client.query(
        "DELETE FROM matching_reports WHERE user_id=$1 AND status<>'running' AND created_at<now()-interval '30 days'",
        [this.owner],
      );
    });
  }
  async list(applicationId: string): Promise<MatchingReport[]> {
    await this.cleanup();
    return this.tx(async (client) => {
      const app = await this.application(client, applicationId);
      const { rows } = await client.query(
        'SELECT * FROM matching_reports WHERE user_id=$1 AND application_id=$2 ORDER BY created_at DESC,id DESC LIMIT 20',
        [this.owner, applicationId],
      );
      return rows.map((row) => ({
        id: row.id,
        applicationId: row.application_id,
        versionId: row.version_id,
        jobRevision: String(row.job_revision),
        jobHash: row.job_hash,
        configuration: row.configuration,
        sources: row.sources,
        result: row.result,
        status: row.status,
        failure: row.failure,
        createdAt: row.created_at.toISOString(),
        outdated:
          String(row.job_revision) !== String(app.description_revision) ||
          row.job_hash !== hash(app.description),
      }));
    });
  }
  private async extractionGate<T>(run: () => Promise<T>): Promise<T> {
    const guard = await this.pool.connect();
    let owned = false,
      slot = 0;
    try {
      owned = (
        await guard.query(
          'SELECT pg_try_advisory_lock(16434,hashtext($1)) AS locked',
          [this.owner],
        )
      ).rows[0].locked;
      if (!owned)
        throw new WorkspaceError(
          'A resume extraction is already running for your account.',
          409,
        );
      for (const candidate of [1, 2])
        if (
          (
            await guard.query(
              'SELECT pg_try_advisory_lock(16433,$1) AS locked',
              [candidate],
            )
          ).rows[0].locked
        ) {
          slot = candidate;
          break;
        }
      if (!slot)
        throw new WorkspaceError(
          'Resume extraction is busy. Please retry shortly.',
          429,
        );
      await this.tx(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(16432,6)');
        for (const [scope, limit] of [
          ['extract:global', 100],
          ['extract:' + this.owner, 20],
        ] as const) {
          const { rows } = await client.query(
            "SELECT attempts FROM matching_usage WHERE day=(now() AT TIME ZONE 'UTC')::date AND scope=$1",
            [scope],
          );
          if ((rows[0]?.attempts ?? 0) >= limit)
            throw new WorkspaceError(
              'The daily text-extraction limit has been reached. Try again after 00:00 UTC.',
              429,
            );
          await client.query(
            "INSERT INTO matching_usage(day,scope,attempts) VALUES((now() AT TIME ZONE 'UTC')::date,$1,1) ON CONFLICT(day,scope) DO UPDATE SET attempts=matching_usage.attempts+1",
            [scope],
          );
        }
      });
      return await run();
    } finally {
      if (slot)
        await guard
          .query('SELECT pg_advisory_unlock(16433,$1)', [slot])
          .catch(() => {});
      if (owned)
        await guard
          .query('SELECT pg_advisory_unlock(16434,hashtext($1))', [this.owner])
          .catch(() => {});
      guard.release();
    }
  }
  async prepare(
    applicationId: string,
    versionId: string,
    name: string,
  ): Promise<
    MatchPreview | { extraction: { status: string; message: string } }
  > {
    if (!this.provider)
      throw new WorkspaceError(
        'AI comparison is unavailable. The local operator has not configured a provider. Your documents stay private.',
        503,
      );
    await this.cleanup();
    const app = (
      await this.pool.query(
        'SELECT description,description_revision FROM applications WHERE user_id=$1 AND id=$2',
        [this.owner, applicationId],
      )
    ).rows[0];
    if (!app) throw new WorkspaceError('Application not found.', 404);
    const row = (
      await this.pool.query(
        'SELECT v.*,d.category,d.archived FROM document_versions v JOIN documents d ON d.user_id=v.user_id AND d.id=v.document_id WHERE v.user_id=$1 AND v.id=$2',
        [this.owner, versionId],
      )
    ).rows[0];
    if (!row) throw new WorkspaceError('Resume version not found.', 404);
    if (row.category !== 'Resumes')
      throw new WorkspaceError('Choose a version from the Resumes category.');
    if (!app.description.trim())
      return {
        extraction: {
          status: 'empty',
          message:
            'Add a saved job description before comparing. FATS does not fetch the job website.',
        },
      };
    const extraction = await this.extractionGate(async () => {
      let bytes: Uint8Array;
      await requireAcceptedDocument(this.pool, row);
      try {
        bytes = await verifiedDocumentBytes(this.storage, row);
      } catch {
        throw new WorkspaceError(
          'This resume file is missing or damaged. Recover it before comparing.',
          409,
        );
      }
      return extractResume(bytes, row.format);
    });
    if (extraction.status !== 'success') return { extraction };
    const resume = sourceSegments(extraction.lines, 'resume', name),
      job = sourceSegments(
        app.description.split(/\r?\n/).map((text: string, i: number) => ({
          text,
          location: 'Job line ' + (i + 1),
        })),
        'job',
        name,
      );
    if (!resume.segments.length || !job.segments.length)
      return {
        extraction: {
          status: 'empty',
          message:
            'No usable text remained after contact-detail removal. Nothing has been sent.',
        },
      };
    const sources: MatchingSources = {
      resume: resume.segments,
      job: job.segments,
      warnings: [
        ...extraction.warnings,
        'Only reviewed text is compared. Absence here is not proof that you lack a qualification.',
        ...(resume.redacted || job.redacted
          ? [
              'Some contact details were removed automatically. This is best-effort redaction; review the remaining text for personal information.',
            ]
          : [
              'Review both sources for personal information before sharing. Automatic redaction cannot guarantee anonymity.',
            ]),
      ],
    };
    if (
      Buffer.byteLength(
        JSON.stringify({ resume: sources.resume, job: sources.job }),
        'utf8',
      ) > MAX_MATCHING_BYTES
    )
      throw new MatchingValidationError(
        'The reviewed text exceeds the 48,000-byte input limit. Use a shorter resume or job description.',
      );
    const provider = this.provider;
    return this.tx(async (client) => {
      const current = await this.application(client, applicationId);
      if (
        current.description !== app.description ||
        String(current.description_revision) !==
          String(app.description_revision)
      )
        throw new WorkspaceError(
          'The job description changed during extraction. Review it again.',
          409,
        );
      if (
        !(
          await client.query(
            'SELECT 1 FROM document_versions WHERE user_id=$1 AND id=$2',
            [this.owner, versionId],
          )
        ).rowCount
      )
        throw new WorkspaceError('Resume version not found.', 404);
      // One active preview per application bounds temporary sensitive text.
      await client.query(
        'DELETE FROM matching_previews WHERE user_id=$1 AND application_id=$2',
        [this.owner, applicationId],
      );
      const id = randomUUID(),
        jobHash = hash(app.description),
        configuration = provider.configuration;
      const result = await client.query(
        'INSERT INTO matching_previews(user_id,id,application_id,version_id,job_revision,job_hash,configuration,sources) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING expires_at',
        [
          this.owner,
          id,
          applicationId,
          versionId,
          app.description_revision,
          jobHash,
          JSON.stringify(configuration),
          JSON.stringify(sources),
        ],
      );
      return {
        id,
        applicationId,
        versionId,
        jobRevision: String(app.description_revision),
        jobHash,
        configuration,
        sources,
        expiresAt: result.rows[0].expires_at.toISOString(),
      };
    });
  }
  async compare(
    previewId: string,
    requestId: string,
  ): Promise<{ id: string; status: string }> {
    const provider = this.provider;
    if (!provider)
      throw new WorkspaceError(
        'AI comparison is unavailable. No provider is configured.',
        503,
      );
    const pending = await this.tx<
      | { existing: { id: string; status: string } }
      | { sources: MatchingSources }
    >(async (client) => {
      const previous = (
        await client.query(
          'SELECT id,status,preview_id FROM matching_reports WHERE user_id=$1 AND (id=$2 OR preview_id=$3)',
          [this.owner, requestId, previewId],
        )
      ).rows[0];
      if (previous) {
        if (previous.preview_id !== previewId)
          throw new WorkspaceError(
            'This request ID was already used for another comparison.',
            409,
          );
        return { existing: { id: previous.id, status: previous.status } };
      }
      const preview = (
        await client.query(
          'SELECT * FROM matching_previews WHERE user_id=$1 AND id=$2 AND expires_at>now()',
          [this.owner, previewId],
        )
      ).rows[0];
      if (!preview)
        throw new WorkspaceError(
          'This text preview expired or is unavailable. Review the text again.',
          409,
        );
      const app = await this.application(client, preview.application_id);
      if (
        String(app.description_revision) !== String(preview.job_revision) ||
        hash(app.description) !== preview.job_hash
      )
        throw new WorkspaceError(
          'The job description changed. Review the new text before sharing.',
          409,
        );
      if (
        preview.configuration.provider !== provider.configuration.provider ||
        preview.configuration.model !== provider.configuration.model ||
        preview.configuration.version !== provider.configuration.version
      )
        throw new WorkspaceError(
          'The analysis configuration changed. Review the text again.',
          409,
        );
      const count = await client.query(
        'SELECT count(*)::int AS count FROM matching_reports WHERE user_id=$1',
        [this.owner],
      );
      if (count.rows[0].count >= 20)
        throw new WorkspaceError(
          'Keep up to 20 reports per account. Delete an old report before comparing again.',
          409,
        );
      if (
        (
          await client.query(
            "SELECT 1 FROM matching_reports WHERE user_id=$1 AND status='running'",
            [this.owner],
          )
        ).rowCount
      )
        throw new WorkspaceError(
          'A comparison is already running. Wait for it before starting another.',
          409,
        );
      await client.query('SELECT pg_advisory_xact_lock(16432,6)');
      const usage = await client.query(
        "SELECT scope,attempts FROM matching_usage WHERE day=(now() AT TIME ZONE 'UTC')::date AND scope=ANY($1::text[])",
        [['global', this.owner]],
      );
      for (const row of usage.rows)
        if (
          row.attempts >=
          (row.scope === 'global' ? this.limits.global : this.limits.account)
        )
          throw new WorkspaceError(
            'The daily comparison limit has been reached. Try again after 00:00 UTC. Failed provider attempts also count.',
            429,
          );
      for (const scope of ['global', this.owner])
        await client.query(
          "INSERT INTO matching_usage(day,scope,attempts) VALUES((now() AT TIME ZONE 'UTC')::date,$1,1) ON CONFLICT(day,scope) DO UPDATE SET attempts=matching_usage.attempts+1",
          [scope],
        );
      await client.query(
        "INSERT INTO matching_reports(user_id,id,preview_id,application_id,version_id,job_revision,job_hash,configuration,sources,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'running')",
        [
          this.owner,
          requestId,
          previewId,
          preview.application_id,
          preview.version_id,
          preview.job_revision,
          preview.job_hash,
          JSON.stringify(preview.configuration),
          JSON.stringify(preview.sources),
        ],
      );
      await client.query(
        'DELETE FROM matching_previews WHERE user_id=$1 AND id=$2',
        [this.owner, previewId],
      );
      return { sources: preview.sources as MatchingSources };
    });
    if ('existing' in pending) return pending.existing;
    let result: unknown;
    try {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        result = await Promise.race([
          provider.analyze(pending.sources, controller.signal),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new ProviderError('timeout'));
            }, this.limits.timeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      result = validateMatchResult(result, pending.sources);
    } catch (error) {
      const failure =
        error instanceof ProviderError
          ? error.code
          : error instanceof MatchingValidationError
            ? 'invalid_output'
            : 'unavailable';
      await this.pool.query(
        "UPDATE matching_reports SET status='failed',failure=$3,sources=NULL WHERE user_id=$1 AND id=$2 AND status='running'",
        [this.owner, requestId, failure],
      );
      return { id: requestId, status: 'failed' };
    }
    const completed = await this.pool.query(
      "UPDATE matching_reports SET status='complete',result=$3 WHERE user_id=$1 AND id=$2 AND status='running' RETURNING id",
      [this.owner, requestId, JSON.stringify(result)],
    );
    return {
      id: requestId,
      status: completed.rowCount ? 'complete' : 'failed',
    };
  }
  async remove(id: string) {
    await this.tx(async (client) => {
      const { rowCount } = await client.query(
        "DELETE FROM matching_reports WHERE user_id=$1 AND id=$2 AND status<>'running'",
        [this.owner, id],
      );
      if (!rowCount)
        throw new WorkspaceError(
          'This report is unavailable or still running.',
          409,
        );
      // Usage counters are deliberately independent of report deletion.
    });
  }
}
