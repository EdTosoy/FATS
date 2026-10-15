import { constants } from 'node:fs';
import {
  open,
  mkdir,
  realpath,
  stat,
  rmdir,
  type FileHandle,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  OpenAiMatchingProvider,
  MATCHING_INSTRUCTIONS,
  MATCHING_SCHEMA,
  ProviderError,
} from '../../../apps/web/src/server/matching-provider';
import type { MatchingSources } from '@fats/domain';
import { digest } from './fixtures';
import { inspectProposal } from './grading';
import type { GoldRequirement } from './dataset';

export const MODEL = 'gpt-6-luna';
export const MINI_MODEL = 'gpt-5.4-mini-2026-03-17';
export type EvaluationModel = typeof MODEL | typeof MINI_MODEL;
export const MAX_REQUESTS = 20;
// Entire documented context at the highest cache-write/long-context rates,
// plus 4,000 output tokens including reasoning: $0.2655, rounded upward.
export const INPUT_TOKEN_CEILING = 1050000;
export const RESERVE_MICROS = 270000;
export const MAX_BUDGET_MICROS = 1000000;
export interface Approval {
  id: string;
  provider: 'openai';
  model: typeof MODEL;
  planDigest: string;
  maxRequests: number;
  maxBudgetMicros: number;
  expiresAt: string;
  authorized: true;
  syntheticOnly: true;
}
export function checkApproval(
  value: unknown,
  planDigest: string,
  now = Date.now(),
): Approval {
  const a = value as Approval;
  if (
    !a ||
    typeof a !== 'object' ||
    Object.keys(a).sort().join(',') !==
      'authorized,expiresAt,id,maxBudgetMicros,maxRequests,model,planDigest,provider,syntheticOnly' ||
    a.authorized !== true ||
    a.syntheticOnly !== true ||
    a.provider !== 'openai' ||
    a.model !== MODEL ||
    a.planDigest !== planDigest ||
    !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(a.id) ||
    !Number.isInteger(a.maxRequests) ||
    a.maxRequests < 1 ||
    a.maxRequests > MAX_REQUESTS ||
    !Number.isInteger(a.maxBudgetMicros) ||
    a.maxBudgetMicros < RESERVE_MICROS ||
    a.maxBudgetMicros > MAX_BUDGET_MICROS ||
    !Number.isFinite(Date.parse(a.expiresAt)) ||
    Date.parse(a.expiresAt) <= now ||
    Date.parse(a.expiresAt) > now + 24 * 60 * 60 * 1000
  )
    throw new Error(
      'Evaluation approval is missing, expired, mismatched, or exceeds the prepared limits.',
    );
  return a;
}
export async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const s = await stat(path);
  if (
    !s.isDirectory() ||
    s.mode & 0o077 ||
    s.uid !== process.getuid?.() ||
    (await realpath(path)) !== resolve(path)
  )
    throw new Error(
      'Evaluation artifacts require a private canonical directory.',
    );
}
export async function privateJson(path: string, value: unknown) {
  const file = await open(
    path,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await file.writeFile(JSON.stringify(value, null, 2) + '\n');
    await file.sync();
  } finally {
    await file.close();
  }
}
export async function readApproval(path: string, planDigest: string) {
  try {
    if ((await realpath(dirname(path))) !== resolve(dirname(path)))
      throw Error('Select a canonical private approval file.');
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const s = await file.stat();
      if (
        !s.isFile() ||
        s.size > 4096 ||
        s.mode & 0o077 ||
        s.uid !== process.getuid?.()
      )
        throw Error('Approval file must be private and bounded.');
      return checkApproval(JSON.parse(await file.readFile('utf8')), planDigest);
    } finally {
      await file.close();
    }
  } catch {
    throw Error(
      'Use a valid private approval file for this exact prepared plan. No provider request was made.',
    );
  }
}
export function checkSmokeReview(
  value: unknown,
  planDigest: string,
  resultDigests: string[],
) {
  const review = value as {
    planDigest: string;
    resultDigests: string[];
    continue: boolean;
    reviewer: string;
    notes: string;
  };
  if (
    !review ||
    typeof review !== 'object' ||
    Object.keys(review).sort().join(',') !==
      'continue,notes,planDigest,resultDigests,reviewer' ||
    review.planDigest !== planDigest ||
    !Array.isArray(review.resultDigests) ||
    review.resultDigests.length !== 2 ||
    resultDigests.length !== 2 ||
    !review.resultDigests.every(
      (hash, index) => hash === resultDigests[index],
    ) ||
    typeof review.continue !== 'boolean' ||
    typeof review.reviewer !== 'string' ||
    !review.reviewer.trim() ||
    typeof review.notes !== 'string' ||
    !review.notes.trim()
  )
    throw Error(
      'Smoke review must identify this plan and both inspected result snapshots.',
    );
  return review.continue;
}
export async function waitForSmokeReview(
  directory: string,
  planDigest: string,
  resultDigests: string[],
  options = { timeoutMs: 300000, pollMs: 500 },
) {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    try {
      const file = await open(
        resolve(directory, 'smoke-review.json'),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const s = await file.stat();
        if (
          !s.isFile() ||
          s.size > 8192 ||
          s.mode & 0o077 ||
          s.uid !== process.getuid?.()
        )
          throw Error();
        const approved = checkSmokeReview(
          JSON.parse(await file.readFile('utf8')),
          planDigest,
          resultDigests,
        );
        return {
          continue: approved,
          reason: approved ? 'reviewed_continue' : 'reviewed_stop',
        };
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        return { continue: false, reason: 'invalid_review' };
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
  }
  return { continue: false, reason: 'review_timeout' };
}
// Reconstruct charges from the durable journal, never from a hand-edited
// summary or a fresh zero counter. An incomplete journal fails closed.
export function replayBudget(journal: string) {
  if (!journal.endsWith('\n') || Buffer.byteLength(journal) > 128000)
    throw Error('Incomplete or excessive evaluation journal.');
  const lines = journal.trimEnd().split('\n');
  const header = JSON.parse(lines[0]);
  const approval = checkApproval(
    header.approval,
    header.approval?.planDigest,
    Date.parse(header.approval?.expiresAt) - 1,
  );
  if (header.reservationMicrosPerRequest !== RESERVE_MICROS)
    throw Error('Evaluation reservation changed.');
  let attempts = 0,
    reservedMicros = 0,
    settledMicros = 0;
  const pending = new Set<number>();
  let prefix = lines[0] + '\n';
  for (const line of lines.slice(1)) {
    const row = JSON.parse(line);
    if (row.continuation) {
      const next = checkApproval(
        row.continuation,
        row.continuation.planDigest,
        Date.parse(row.continuation.expiresAt) - 1,
      );
      if (
        row.previousLedgerDigest !== digest(prefix) ||
        next.maxRequests > approval.maxRequests ||
        next.maxBudgetMicros > approval.maxBudgetMicros
      )
        throw Error('Invalid cumulative evaluation continuation.');
    } else if (typeof row.caseId === 'string') {
      if (
        row.attempt !== attempts + 1 ||
        attempts >= approval.maxRequests ||
        row.reservedMicros !== reservedMicros + RESERVE_MICROS ||
        row.reservedMicros > approval.maxBudgetMicros
      )
        throw Error('Invalid cumulative request reservation.');
      attempts = row.attempt;
      reservedMicros = row.reservedMicros;
      pending.add(attempts);
    } else {
      if (
        !pending.has(row.attempt) ||
        !Number.isInteger(row.settledMicros) ||
        row.settledMicros < 0 ||
        row.settledMicros > RESERVE_MICROS ||
        row.reservedMicros !==
          reservedMicros - RESERVE_MICROS + row.settledMicros
      )
        throw Error('Invalid cumulative usage settlement.');
      reservedMicros = row.reservedMicros;
      settledMicros += row.settledMicros;
      pending.delete(row.attempt);
    }
    prefix += line + '\n';
  }
  return {
    attempts,
    reservedMicros,
    settledMicros,
    unresolvedRequests: pending.size,
    maxRequests: approval.maxRequests,
    maxBudgetMicros: approval.maxBudgetMicros,
  };
}
export async function budgetCheckpoint(directory: string) {
  await privateDirectory(directory);
  const file = await open(
    resolve(directory, 'budget.jsonl'),
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const s = await file.stat();
    if (
      !s.isFile() ||
      s.size > 128000 ||
      s.mode & 0o077 ||
      s.uid !== process.getuid?.()
    )
      throw Error('A private bounded cumulative journal is required.');
    const journal = await file.readFile('utf8');
    return {
      directory,
      ledgerDigest: digest(journal),
      ...replayBudget(journal),
    };
  } finally {
    await file.close();
  }
}
export class BudgetLedger {
  private attempts = 0;
  private reservedMicros = 0;
  private settledMicros = 0;
  private readonly pending = new Set<number>();
  private writing = false;
  private failed = false;
  private constructor(
    private readonly file: FileHandle,
    private readonly approval: Approval,
    private readonly lockDirectory?: string,
  ) {}
  static async resume(
    checkpoint: Awaited<ReturnType<typeof budgetCheckpoint>>,
    approval: Approval,
  ) {
    checkApproval(approval, approval.planDigest);
    const lock = resolve(checkpoint.directory, 'active-continuation');
    await mkdir(lock, { mode: 0o700 });
    let file: FileHandle | undefined;
    try {
      const current = await budgetCheckpoint(checkpoint.directory);
      if (
        current.ledgerDigest !== checkpoint.ledgerDigest ||
        current.unresolvedRequests ||
        approval.maxRequests > current.maxRequests ||
        approval.maxBudgetMicros > current.maxBudgetMicros ||
        current.attempts >= approval.maxRequests ||
        current.reservedMicros + RESERVE_MICROS > approval.maxBudgetMicros
      )
        throw Error(
          'Stale, unresolved or exhausted cumulative evaluation budget.',
        );
      file = await open(
        resolve(checkpoint.directory, 'budget.jsonl'),
        constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW,
      );
      await file.writeFile(
        JSON.stringify({
          continuation: approval,
          previousLedgerDigest: current.ledgerDigest,
          at: new Date().toISOString(),
        }) + '\n',
      );
      await file.sync();
      const ledger = new BudgetLedger(file, approval, lock);
      ledger.attempts = current.attempts;
      ledger.reservedMicros = current.reservedMicros;
      ledger.settledMicros = current.settledMicros;
      return ledger;
    } catch (error) {
      await file?.close();
      await rmdir(lock);
      throw error;
    }
  }
  static async create(directory: string, approval: Approval) {
    // An approval has exactly one run directory; an existing ledger cannot be reset/reused.
    await mkdir(directory, { mode: 0o700 });
    if ((await realpath(directory)) !== resolve(directory))
      throw Error('Use a canonical evaluation directory.');
    const file = await open(
      resolve(directory, 'budget.jsonl'),
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(
        JSON.stringify({
          approval,
          reservationMicrosPerRequest: RESERVE_MICROS,
        }) + '\n',
      );
      await file.sync();
      const current = await open(directory, constants.O_RDONLY);
      try {
        await current.sync();
      } finally {
        await current.close();
      }
      const parent = await open(dirname(directory), constants.O_RDONLY);
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      return new BudgetLedger(file, approval);
    } catch (error) {
      await file.close();
      throw error;
    }
  }
  async reserve(caseId: string) {
    if (
      this.writing ||
      this.failed ||
      Date.parse(this.approval.expiresAt) <= Date.now() ||
      this.attempts >= this.approval.maxRequests ||
      this.reservedMicros + RESERVE_MICROS > this.approval.maxBudgetMicros
    )
      throw Error(
        'Evaluation budget, request ceiling, or authorization boundary reached.',
      );
    this.writing = true;
    try {
      this.attempts++;
      this.reservedMicros += RESERVE_MICROS;
      this.pending.add(this.attempts);
      await this.file.writeFile(
        JSON.stringify({
          caseId,
          attempt: this.attempts,
          reservedMicros: this.reservedMicros,
          at: new Date().toISOString(),
        }) + '\n',
      );
      await this.file.sync();
      return this.attempts;
    } catch (error) {
      this.failed = true;
      throw error;
    } finally {
      this.writing = false;
    }
  }
  async settle(attempt: number, budgetMicros: number) {
    if (
      this.writing ||
      this.failed ||
      !this.pending.has(attempt) ||
      !Number.isInteger(budgetMicros) ||
      budgetMicros < 0 ||
      budgetMicros > RESERVE_MICROS
    )
      throw Error('Invalid or repeated evaluation usage settlement.');
    this.writing = true;
    try {
      const reservedMicros =
        this.reservedMicros - RESERVE_MICROS + budgetMicros;
      await this.file.writeFile(
        JSON.stringify({
          attempt,
          settledMicros: budgetMicros,
          reservedMicros,
          at: new Date().toISOString(),
        }) + '\n',
      );
      await this.file.sync();
      // Release only after the conservative charge is durable. Unknown usage
      // never settles; crashes cannot reopen or reset this single-use ledger.
      this.reservedMicros = reservedMicros;
      this.settledMicros += budgetMicros;
      this.pending.delete(attempt);
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
      unresolvedRequests: this.pending.size,
    };
  }
  async close() {
    await this.file.close();
    if (this.lockDirectory) await rmdir(this.lockDirectory);
  }
}
export function usageCost(value: unknown, model: EvaluationModel = MODEL) {
  const mini = model === MINI_MODEL;
  const u = value as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
      cache_write_tokens?: number;
    };
    output_tokens_details?: { reasoning_tokens?: number };
  } | null;
  if (
    !u ||
    !Number.isInteger(u.input_tokens) ||
    !Number.isInteger(u.output_tokens) ||
    u.input_tokens! < 0 ||
    u.input_tokens! > (mini ? 400000 : INPUT_TOKEN_CEILING) ||
    u.output_tokens! < 0 ||
    u.output_tokens! > 4000
  )
    return null;
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const writes = u.input_tokens_details?.cache_write_tokens;
  const reasoning = u.output_tokens_details?.reasoning_tokens ?? null;
  if (
    !Number.isInteger(cached) ||
    cached < 0 ||
    cached > u.input_tokens! ||
    (writes !== undefined &&
      (!Number.isInteger(writes) ||
        writes < 0 ||
        writes + cached > u.input_tokens!)) ||
    (reasoning !== null &&
      (!Number.isInteger(reasoning) ||
        reasoning < 0 ||
        reasoning > u.output_tokens!))
  )
    return null;
  const inputMultiplier = !mini && u.input_tokens! > 272000 ? 2 : 1;
  const outputMultiplier = !mini && u.input_tokens! > 272000 ? 1.5 : 1;
  // Missing cache-write usage is priced conservatively, never assumed free.
  const writeTokens = writes ?? u.input_tokens! - cached;
  const inputRate = mini ? 750 : 100,
    cacheRate = mini ? 75 : 10,
    writeRate = mini ? 750 : 125,
    outputRate = mini ? 4500 : 500;
  return {
    inputTokens: u.input_tokens!,
    cachedTokens: cached,
    cacheWriteTokens: writes ?? null,
    outputTokens: u.output_tokens!,
    reasoningTokens: reasoning,
    estimatedMicros: Math.ceil(
      ((u.input_tokens! - cached - writeTokens) * inputRate * inputMultiplier +
        cached * cacheRate * inputMultiplier +
        writeTokens * writeRate * inputMultiplier +
        u.output_tokens! * outputRate * outputMultiplier) /
        1000,
    ),
    // Budget settlement ignores all cache discounts, so even incomplete cache
    // details cannot undercount the authorization ceiling.
    budgetMicros: Math.ceil(
      (u.input_tokens! * writeRate * inputMultiplier +
        u.output_tokens! * outputRate * outputMultiplier) /
        1000,
    ),
    accounting:
      writes === undefined && !mini
        ? 'cache_write_upper_bound'
        : 'reported_token_rates',
    invoiceCost: null,
  };
}
// Evaluation diagnostics only. Never retain raw provider messages, payloads,
// credentials, account identifiers or arbitrary header values.
const codes = [
  'rate_limit_exceeded',
  'insufficient_quota',
  'billing_hard_limit_reached',
  'billing_not_active',
] as const;
const types = [
  ...codes,
  'requests',
  'tokens',
  'rate_limit_error',
  'invalid_request_error',
  'server_error',
] as const;
type Category = 'rate_limit' | 'quota_or_billing' | 'billing_limit' | 'unknown';
function category(code: unknown): Category {
  if (code === 'rate_limit_exceeded') return 'rate_limit';
  if (code === 'insufficient_quota') return 'quota_or_billing';
  if (code === 'billing_hard_limit_reached' || code === 'billing_not_active')
    return 'billing_limit';
  return 'unknown';
}
function numberHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value || !/^\d{1,12}$/.test(value)) return null;
  return Number(value);
}
function durationHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (
    !value ||
    value.length > 40 ||
    !/^(?:\d+(?:\.\d+)?(?:ms|s|m|h))+$/.test(value)
  )
    return null;
  let seconds = 0;
  for (const part of value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g))
    seconds += Number(part[1]) * { ms: 0.001, s: 1, m: 60, h: 3600 }[part[2]]!;
  return Number.isFinite(seconds) && seconds <= 86400 ? seconds : null;
}
async function boundedError(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return (
      JSON.parse(Buffer.concat(chunks, size).toString('utf8'))?.error ?? null
    );
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
export async function sanitizedProviderFailure(
  response: Response,
  now = Date.now(),
) {
  const error = await boundedError(response);
  const code = codes.find((value) => value === error?.code) ?? null;
  const type = types.find((value) => value === error?.type) ?? null;
  const messagePresent = typeof error?.message === 'string';
  const message = messagePresent ? (error.message as string) : '';
  // Fixed categories disclose useful hints without preserving even fragments of
  // a free-form message. Messages alone never establish the failure's cause.
  const messageCategory: Category = /^Rate limit reached\b/i.test(message)
    ? 'rate_limit'
    : /^You exceeded your current quota\b/i.test(message)
      ? 'quota_or_billing'
      : /^Billing hard limit has been reached\b/i.test(message)
        ? 'billing_limit'
        : 'unknown';
  const codeCategory = category(code),
    typeCategory = category(type);
  const conflictingHints =
    new Set(
      [codeCategory, typeCategory, messageCategory].filter(
        (value) => value !== 'unknown',
      ),
    ).size > 1;
  const classification = conflictingHints ? 'unknown' : codeCategory;
  const id = response.headers.get('x-request-id');
  const retry = response.headers.get('retry-after');
  let retryAfterSeconds: number | null = null;
  if (retry && /^\d{1,5}(?:\.\d{1,3})?$/.test(retry))
    retryAfterSeconds = Number(retry);
  else if (retry && retry.length <= 40 && Number.isFinite(Date.parse(retry)))
    retryAfterSeconds = Math.max(
      0,
      Math.ceil((Date.parse(retry) - now) / 1000),
    );
  if (retryAfterSeconds !== null && retryAfterSeconds > 86400)
    retryAfterSeconds = null;
  return {
    classification,
    code,
    type,
    messagePresent,
    messageCategory,
    conflictingHints,
    requestId: id && /^req_[A-Za-z0-9_-]{1,120}$/.test(id) ? id : null,
    capturedAt: new Date(now).toISOString(),
    retryAfterSeconds,
    rateLimits: {
      limitRequests: numberHeader(
        response.headers,
        'x-ratelimit-limit-requests',
      ),
      remainingRequests: numberHeader(
        response.headers,
        'x-ratelimit-remaining-requests',
      ),
      resetRequestsSeconds: durationHeader(
        response.headers,
        'x-ratelimit-reset-requests',
      ),
      limitTokens: numberHeader(response.headers, 'x-ratelimit-limit-tokens'),
      remainingTokens: numberHeader(
        response.headers,
        'x-ratelimit-remaining-tokens',
      ),
      resetTokensSeconds: durationHeader(
        response.headers,
        'x-ratelimit-reset-tokens',
      ),
    },
    // Never equate a diagnostic classification with verified billing evidence.
    actualCharge: null,
  };
}

async function boundedJson(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError('invalid_output');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 128000) {
        await reader.cancel();
        throw new ProviderError('invalid_output');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}
export async function analyzeOnce(options: {
  id: string;
  sources: MatchingSources;
  gold: GoldRequirement[];
  ledger: Pick<BudgetLedger, 'reserve' | 'settle'>;
  model?: EvaluationModel;
  key: string;
  transport: typeof fetch;
  timeoutMs?: number;
}) {
  const model = options.model ?? MODEL;
  let httpStatus: number | null = null,
    usage: ReturnType<typeof usageCost> = null,
    sentBytes = 0,
    tier: string | null = null;
  let stop = false,
    attempted = false;
  let providerStartedAt: number | null = null;
  let providerFailure: Awaited<
    ReturnType<typeof sanitizedProviderFailure>
  > | null = null;
  let formatFailure: 'envelope_json' | 'result_json' | null = null;
  const transport: typeof fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (
      url !== 'https://api.openai.com/v1/responses' ||
      init?.method !== 'POST' ||
      init.redirect !== 'error' ||
      body.model !== model ||
      body.store !== false ||
      body.max_output_tokens !== 4000 ||
      body.reasoning?.effort !== 'low' ||
      body.instructions !== MATCHING_INSTRUCTIONS ||
      digest(body.text?.format?.schema) !== digest(MATCHING_SCHEMA) ||
      'tools' in body ||
      'previous_response_id' in body
    )
      throw Error('Provider request differs from the approved evaluation.');
    // Evaluation-only standard tier pins pricing even if project defaults differ.
    body.service_tier = 'default';
    const serialized = JSON.stringify(body);
    sentBytes = Buffer.byteLength(serialized);
    if (
      sentBytes > 64000 ||
      body.input !==
        JSON.stringify({
          resume: options.sources.resume.map(({ id, text }) => ({ id, text })),
          job: options.sources.job.map(({ id, text, importance }) => ({
            id,
            text,
            importance,
          })),
        })
    )
      throw Error('Unexpected or excessive evaluation payload.');
    let attempt: number;
    try {
      attempt = await options.ledger.reserve(options.id);
    } catch (error) {
      stop = true;
      throw error;
    }
    if (controller.signal.aborted) throw new ProviderError('timeout');
    attempted = true;
    providerStartedAt = performance.now();
    const response = await options.transport(url, {
      ...init,
      body: serialized,
    });
    httpStatus = response.status;
    if (!response.ok) {
      stop = true;
      providerFailure = await sanitizedProviderFailure(response);
      return new Response(null, { status: response.status });
    }
    const data = await boundedJson(response).catch((error) => {
      if (error instanceof SyntaxError) formatFailure = 'envelope_json';
      throw error;
    });
    for (const item of Array.isArray(data?.output) ? data.output : [])
      for (const content of Array.isArray(item?.content) ? item.content : [])
        if (content?.type === 'output_text' && typeof content.text === 'string')
          try {
            JSON.parse(content.text);
          } catch {
            formatFailure = 'result_json';
          }
    usage = usageCost(data.usage, model);
    tier = typeof data.service_tier === 'string' ? data.service_tier : null;
    if (tier !== 'default' || data.model !== model || !usage) {
      stop = true;
      throw new ProviderError('invalid_output');
    }
    try {
      await options.ledger.settle(attempt, usage.budgetMicros);
    } catch {
      stop = true;
      throw new ProviderError('invalid_output');
    }
    return Response.json(data);
  };
  const controller = new AbortController(),
    start = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let proposal: unknown = null,
    failure: string | null = null;
  try {
    const provider = new OpenAiMatchingProvider(
      options.key,
      transport,
      model === MODEL ? 'luna-low' : 'mini-low',
    );
    proposal = await Promise.race([
      provider.analyze(options.sources, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ProviderError('timeout'));
        }, options.timeoutMs ?? 30000);
      }),
    ]);
  } catch (error) {
    failure = error instanceof ProviderError ? error.code : 'evaluation_guard';
  } finally {
    if (timer) clearTimeout(timer);
  }
  const diagnostics =
    proposal === null
      ? null
      : inspectProposal(proposal, options.sources, options.gold);
  return {
    caseId: options.id,
    attempted,
    latencyMs: Math.round(performance.now() - start),
    providerLatencyMs:
      providerStartedAt === null
        ? null
        : Math.round(performance.now() - providerStartedAt),
    httpStatus,
    sentBytes,
    serviceTier: tier,
    usage: usage as ReturnType<typeof usageCost>,
    failure,
    providerFailure: providerFailure as Awaited<
      ReturnType<typeof sanitizedProviderFailure>
    > | null,
    formatFailure: formatFailure as 'envelope_json' | 'result_json' | null,
    proposal,
    diagnostics,
    stop,
    manualReview: {
      status: 'pending',
      reviewer: '',
      notes: '',
      privacyIssue: null,
      unexpectedRequirements: null,
    },
  };
}
