import { constants } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  realpath,
  rmdir,
  type FileHandle,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import proposal from './comparison-plan.v1.json';
import additional from './comparison-fixtures.v1.json';
import { DATASET, type EvaluationCase } from './dataset';
import { prepareCase, digest, datasetDigest } from './fixtures';
import {
  budgetCheckpoint,
  privateDirectory,
  privateJson,
  MODEL,
  MINI_MODEL,
  type EvaluationModel,
} from './harness';
import {
  MATCHING_INSTRUCTIONS,
  MATCHING_SCHEMA,
} from '../../../apps/web/src/server/matching-provider';

export const COMPARISON_REQUESTS = 12;
export const COMPARISON_BUDGET_MICROS = 500000;
export const reservations = { [MODEL]: 270000, [MINI_MODEL]: 320000 };
export const slots = proposal.requestPairs.flatMap((pair) =>
  pair.models.map((model) => ({
    caseId: pair.caseId,
    model: model as EvaluationModel,
  })),
);
const sha = (text: string | Uint8Array) =>
  createHash('sha256').update(text).digest('hex');

// Freeze all prior source bytes except the three explicit Mini-low profile edits.
// Reversing only those edits must reproduce the original provider fingerprint.
export function originalProviderSource(source: string) {
  return source
    .replace(
      "'phase6' | 'luna-low' | 'mini-low' = 'phase6'",
      "'phase6' | 'luna-low' = 'phase6'",
    )
    .replace(
      "          : profile === 'mini-low'\n            ? MATCHING_CONTRACT_VERSION + '-mini-low'\n            : MATCHING_CONTRACT_VERSION,",
      '          : MATCHING_CONTRACT_VERSION,',
    )
    .replace(
      "this.profile === 'phase6' ? 'none' : 'low'",
      "this.profile === 'luna-low' ? 'low' : 'none'",
    );
}
export async function prepareComparison() {
  if (
    datasetDigest() !== proposal.datasetDigest ||
    sha(MATCHING_INSTRUCTIONS) !== proposal.sharedContractSha256.instructions ||
    sha(JSON.stringify(MATCHING_SCHEMA)) !==
      proposal.sharedContractSha256.schemaJson
  )
    throw Error('Frozen comparison contract changed.');
  for (const [path, expected] of Object.entries(proposal.sharedSourceSha256)) {
    let source = await readFile(path, 'utf8');
    if (path.endsWith('/matching-provider.ts'))
      source = originalProviderSource(source);
    if (sha(source) !== expected)
      throw Error('Frozen comparison source changed: ' + path);
  }
  const prepared = [];
  for (const planned of proposal.cases) {
    const entry = [...DATASET, ...(additional.cases as EvaluationCase[])].find(
      (entry) => entry.id === planned.id,
    )!;
    const p = await prepareCase(entry);
    if (
      p.state !== 'ready' ||
      p.contentHash !== planned.sourceDigest ||
      JSON.stringify(
        entry.gold.map((g) => ({ id: g.id, classification: g.expected[0] })),
      ) !== JSON.stringify(planned.expected)
    )
      throw Error('Frozen comparison inputs changed.');
    prepared.push(p);
  }
  const history = await budgetCheckpoint(
    resolve(
      'test-results/phase6-1',
      proposal.existingCheckpoint.ledgerDirectory,
    ),
  );
  if (
    history.ledgerDigest !== proposal.existingCheckpoint.ledgerDigest ||
    history.attempts !== 4 ||
    history.reservedMicros !== 613 ||
    history.unresolvedRequests
  )
    throw Error('Historical accounting requires reconciliation.');
  const sources = [
    'apps/web/src/server/matching-provider.ts',
    'tests/evaluation/matching/harness.ts',
    'tests/evaluation/matching/comparison.ts',
    'tests/evaluation/matching/comparison.run.test.ts',
    'vitest.comparison.config.ts',
  ];
  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sources.map(async (path) => [path, sha(await readFile(path))]),
    ),
  );
  const plan = {
    version: 'authorized-comparison-v1',
    proposedPlanDigest: digest(proposal),
    sourceHashes,
    contract: proposal.sharedContractSha256,
    history,
    slots,
    maxRequests: COMPARISON_REQUESTS,
    maxBudgetMicros: COMPARISON_BUDGET_MICROS,
    reservations,
    requestSettings: proposal.requestSettings,
    pricing: proposal.models,
    pricingCheckedOn: '2026-10-16',
    caseDigests: prepared.map((p) => ({
      id: p.entry.id,
      digest: p.contentHash,
    })),
    review:
      'Manual unblinded; no model grader. Frozen primary and prespecified SQL exclusion sensitivity.',
  };
  return { prepared, plan, planDigest: digest(plan), history };
}
export interface ComparisonApproval {
  id: string;
  planDigest: string;
  expiresAt: string;
  authorized: true;
  syntheticOnly: true;
  models: [typeof MODEL, typeof MINI_MODEL];
  maxRequests: 12;
  maxBudgetMicros: 500000;
}
export function checkComparisonApproval(
  value: unknown,
  planDigest: string,
): ComparisonApproval {
  const a = value as ComparisonApproval;
  if (
    !a ||
    Object.keys(a).sort().join(',') !==
      'authorized,expiresAt,id,maxBudgetMicros,maxRequests,models,planDigest,syntheticOnly' ||
    a.authorized !== true ||
    a.syntheticOnly !== true ||
    a.planDigest !== planDigest ||
    !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(a.id) ||
    JSON.stringify(a.models) !== JSON.stringify([MODEL, MINI_MODEL]) ||
    a.maxRequests !== 12 ||
    a.maxBudgetMicros !== 500000 ||
    !Number.isFinite(Date.parse(a.expiresAt)) ||
    Date.parse(a.expiresAt) <= Date.now() ||
    Date.parse(a.expiresAt) > Date.now() + 86400000
  )
    throw Error(
      'Comparison authorization missing, stale, changed or excessive.',
    );
  return a;
}
export async function readComparisonApproval(path: string, planDigest: string) {
  if ((await realpath(dirname(path))) !== resolve(dirname(path)))
    throw Error('Use a canonical private approval.');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await file.stat();
    if (
      !s.isFile() ||
      s.size > 4096 ||
      s.mode & 0o077 ||
      s.uid !== process.getuid?.()
    )
      throw Error('Use a private bounded approval.');
    return checkComparisonApproval(
      JSON.parse(await file.readFile('utf8')),
      planDigest,
    );
  } finally {
    await file.close();
  }
}
type Checkpoint = Awaited<ReturnType<typeof budgetCheckpoint>>;
export class ComparisonLedger {
  private attempts = 0;
  private reservedMicros = 0;
  private settledMicros = 0;
  private pending: { attempt: number; hold: number } | null = null;
  private writing = false;
  private failed = false;
  private constructor(
    private file: FileHandle,
    private approval: ComparisonApproval,
    private history: Checkpoint,
    private lock: string,
  ) {}
  static async create(
    directory: string,
    approval: ComparisonApproval,
    history: Checkpoint,
  ) {
    checkComparisonApproval(approval, approval.planDigest);
    const lock = resolve(history.directory, 'active-continuation');
    await mkdir(lock, { mode: 0o700 });
    let file: FileHandle | undefined;
    try {
      const current = await budgetCheckpoint(history.directory);
      if (
        digest(current) !== digest(history) ||
        current.unresolvedRequests ||
        current.attempts + 12 > current.maxRequests ||
        current.reservedMicros + 500000 > current.maxBudgetMicros
      )
        throw Error('Historical budget changed or insufficient.');
      await mkdir(directory, { mode: 0o700 });
      await privateDirectory(directory);
      // Permanent, exclusive authorization claim: never reset/reopen after crashes.
      await privateJson(
        resolve(history.directory, 'controlled-comparison-claim.json'),
        { approval, directory, history },
      );
      const parent = await open(history.directory, constants.O_RDONLY);
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      file = await open(
        resolve(directory, 'budget.jsonl'),
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600,
      );
      await file.writeFile(
        JSON.stringify({ approval, history, reservations, slots }) + '\n',
      );
      await file.sync();
      const dir = await open(directory, constants.O_RDONLY);
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
      return new ComparisonLedger(file, approval, history, lock);
    } catch (error) {
      await file?.close();
      await rmdir(lock);
      throw error;
    }
  }
  forModel(model: EvaluationModel) {
    return {
      reserve: (caseId: string) => this.reserve(caseId, model),
      settle: (attempt: number, micros: number) => this.settle(attempt, micros),
    };
  }
  private async reserve(caseId: string, model: EvaluationModel) {
    const hold = reservations[model],
      slot = slots[this.attempts];
    if (
      this.failed ||
      this.writing ||
      this.pending ||
      Date.parse(this.approval.expiresAt) <= Date.now() ||
      !slot ||
      slot.caseId !== caseId ||
      slot.model !== model ||
      this.reservedMicros + hold > this.approval.maxBudgetMicros
    )
      throw Error(
        'Comparison budget, sequence, pending charge or authorization boundary reached.',
      );
    this.writing = true;
    try {
      const attempt = this.attempts + 1;
      await this.file.writeFile(
        JSON.stringify({
          attempt,
          caseId,
          model,
          hold,
          reservedMicros: this.reservedMicros + hold,
          at: new Date().toISOString(),
        }) + '\n',
      );
      await this.file.sync();
      this.attempts = attempt;
      this.reservedMicros += hold;
      this.pending = { attempt, hold };
      return attempt;
    } catch (error) {
      this.failed = true;
      throw error;
    } finally {
      this.writing = false;
    }
  }
  async settle(attempt: number, micros: number) {
    if (
      this.failed ||
      this.writing ||
      !this.pending ||
      this.pending.attempt !== attempt ||
      !Number.isInteger(micros) ||
      micros < 0 ||
      micros > this.pending.hold
    )
      throw Error('Invalid comparison settlement.');
    this.writing = true;
    try {
      const reservedMicros = this.reservedMicros - this.pending.hold + micros;
      await this.file.writeFile(
        JSON.stringify({
          attempt,
          settledMicros: micros,
          reservedMicros,
          at: new Date().toISOString(),
        }) + '\n',
      );
      await this.file.sync();
      this.reservedMicros = reservedMicros;
      this.settledMicros += micros;
      this.pending = null;
    } catch (error) {
      this.failed = true;
      throw error;
    } finally {
      this.writing = false;
    }
  }
  summary() {
    return {
      attempts: this.attempts,
      reservedMicros: this.reservedMicros,
      settledMicros: this.settledMicros,
      unresolvedRequests: this.pending ? 1 : 0,
      combinedAttempts: this.history.attempts + this.attempts,
      combinedConservativeMicros:
        this.history.reservedMicros + this.reservedMicros,
    };
  }
  async close() {
    await this.file.close();
    await rmdir(this.lock);
  }
}
