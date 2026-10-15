import { it, expect, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  sanitizedProviderFailure,
  MODEL,
  MINI_MODEL,
  BudgetLedger,
  budgetCheckpoint,
  analyzeOnce,
} from '../evaluation/matching/harness';
import {
  ComparisonLedger,
  type ComparisonApproval,
} from '../evaluation/matching/comparison';
import {
  auditComparisonJournal,
  outputLimitScenario,
} from '../evaluation/matching/reconciliation';
import { prepareCase } from '../evaluation/matching/fixtures';
import { DATASET } from '../evaluation/matching/dataset';

it('distinguishes explicit rate/quota/billing codes while preserving only allowlisted diagnostics', async () => {
  for (const [code, type, classification] of [
    ['rate_limit_exceeded', 'tokens', 'rate_limit'],
    ['insufficient_quota', 'insufficient_quota', 'quota_or_billing'],
    ['billing_hard_limit_reached', 'invalid_request_error', 'billing_limit'],
    ['unknown-private-code', 'unknown-private-type', 'unknown'],
  ]) {
    const result = await sanitizedProviderFailure(
      Response.json(
        {
          error: {
            code,
            type,
            message: 'PRIVATE KEY RESUME PROJECT ORG CONTENT',
          },
          usage: { input_tokens: 0 },
        },
        {
          status: 429,
          headers: {
            'x-request-id': 'req_synthetic_123',
            'retry-after': '2',
            'x-ratelimit-limit-requests': '100',
            'x-ratelimit-remaining-requests': '0',
            'x-ratelimit-reset-requests': '1m500ms',
            'x-ratelimit-reset-tokens': '6ms',
            'x-ratelimit-limit-tokens': 'PRIVATE',
            'x-organization-id': 'PRIVATE',
          },
        },
      ),
      0,
    );
    expect(result.classification).toBe(classification);
    expect(result).toMatchObject({
      requestId: 'req_synthetic_123',
      retryAfterSeconds: 2,
      actualCharge: null,
      rateLimits: {
        limitRequests: 100,
        remainingRequests: 0,
        resetRequestsSeconds: 60.5,
        resetTokensSeconds: 0.006,
        limitTokens: null,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|unknown-private/);
  }
});
it('does not infer the 429 cause from status, a free-form message or contradictory hints', async () => {
  const noCode = await sanitizedProviderFailure(
    Response.json(
      {
        error: { message: 'You exceeded your current quota. PRIVATE DETAILS' },
      },
      { status: 429 },
    ),
  );
  expect(noCode).toMatchObject({
    classification: 'unknown',
    code: null,
    type: null,
    messageCategory: 'quota_or_billing',
    actualCharge: null,
  });
  const contradiction = await sanitizedProviderFailure(
    Response.json(
      {
        error: {
          code: 'rate_limit_exceeded',
          type: 'insufficient_quota',
          message: 'Rate limit reached for PRIVATE',
        },
      },
      { status: 429 },
    ),
  );
  expect(contradiction).toMatchObject({
    classification: 'unknown',
    conflictingHints: true,
  });
  expect(JSON.stringify(contradiction)).not.toContain('PRIVATE');
  const date = await sanitizedProviderFailure(
    new Response('malformed PRIVATE', {
      status: 429,
      headers: {
        'x-request-id': 'PRIVATE invalid id',
        'retry-after': 'Thu, 01 Jan 1970 00:00:03 GMT',
        'x-ratelimit-reset-tokens': 'PRIVATE',
      },
    }),
    500,
  );
  expect(date).toMatchObject({
    classification: 'unknown',
    requestId: null,
    retryAfterSeconds: 3,
    rateLimits: { resetTokensSeconds: null },
  });
  expect(JSON.stringify(date)).not.toContain('PRIVATE');
});
it('bounds error-body reads and cancels oversized input without retaining it', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode('PRIVATE'.repeat(1000)));
    },
    cancel() {
      cancelled = true;
    },
  });
  const result = await sanitizedProviderFailure(
    new Response(stream, {
      status: 429,
      headers: { 'x-request-id': 'req_synthetic' },
    }),
  );
  expect(cancelled).toBe(true);
  expect(result.classification).toBe('unknown');
  expect(result.requestId).toBe('req_synthetic');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
async function environment() {
  const root = await mkdtemp('/tmp/fats-reconcile-');
  const approval: ComparisonApproval = {
    id: randomUUID(),
    authorized: true,
    syntheticOnly: true,
    models: [MODEL, MINI_MODEL],
    planDigest: 'frozen',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    maxRequests: 12,
    maxBudgetMicros: 500000,
  };
  const original = await BudgetLedger.create(root + '/history', {
    id: randomUUID(),
    provider: 'openai',
    model: MODEL,
    planDigest: 'prior',
    maxRequests: 20,
    maxBudgetMicros: 1000000,
    expiresAt: approval.expiresAt,
    authorized: true,
    syntheticOnly: true,
  });
  for (const charge of [179, 124, 151, 159]) {
    const n = await original.reserve('historical');
    await original.settle(n, charge);
  }
  await original.close();
  const history = await budgetCheckpoint(root + '/history');
  return { root, history, approval };
}
it('reproduces Mini 429 offline, captures diagnostics once and retains its entire liability without a retry or refund', async () => {
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(Error('Network prohibited in offline reconciliation.'));
  const e = await environment();
  const ledger = await ComparisonLedger.create(
    e.root + '/comparison',
    e.approval,
    e.history,
  );
  let calls = 0;
  try {
    await ledger.forModel(MODEL).reserve('03');
    await ledger.settle(1, 185);
    const p = await prepareCase(DATASET[2]);
    const result = await analyzeOnce({
      id: '03',
      sources: p.sources!,
      gold: p.entry.gold,
      model: MINI_MODEL,
      ledger: ledger.forModel(MINI_MODEL),
      key: 'synthetic-key',
      transport: async (_url, init) => {
        calls++;
        expect(JSON.parse(String(init?.body))).toMatchObject({
          model: MINI_MODEL,
          reasoning: { effort: 'low' },
          max_output_tokens: 4000,
          store: false,
          service_tier: 'default',
        });
        expect(ledger.summary()).toMatchObject({
          attempts: 2,
          reservedMicros: 320185,
        });
        return Response.json(
          {
            error: {
              code: 'insufficient_quota',
              type: 'insufficient_quota',
              message: 'You exceeded your current quota. PRIVATE ACCOUNT',
            },
            usage: { input_tokens: 0, output_tokens: 0 },
          },
          {
            status: 429,
            headers: { 'x-request-id': 'req_synthetic', 'retry-after': '60' },
          },
        );
      },
    });
    expect(calls).toBe(1);
    expect(network).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      httpStatus: 429,
      stop: true,
      usage: null,
      failure: 'unavailable',
      providerFailure: {
        classification: 'quota_or_billing',
        requestId: 'req_synthetic',
        actualCharge: null,
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|synthetic-key/);
    expect(ledger.summary()).toMatchObject({
      attempts: 2,
      reservedMicros: 320185,
      unresolvedRequests: 1,
      combinedAttempts: 6,
      combinedConservativeMicros: 320798,
    });
    await expect(ledger.forModel(MINI_MODEL).reserve('06')).rejects.toThrow();
    const journal = await readFile(e.root + '/comparison/budget.jsonl', 'utf8');
    const expected = { planDigest: e.approval.planDigest, history: e.history };
    expect(auditComparisonJournal(journal, expected)).toMatchObject({
      attempts: 2,
      remainingRequests: 10,
      remainingBudgetMicros: 179815,
      settledMicros: 185,
      unresolvedMicros: 320000,
      combinedAttempts: 6,
      nextSlot: { caseId: '06', model: MINI_MODEL },
      nextReservationMicros: 320000,
      budgetAllowsNext: false,
      liveAuthorized: false,
    });
    expect(await readFile(e.root + '/comparison/budget.jsonl', 'utf8')).toBe(
      journal,
    );
    for (const tampered of [
      journal.slice(0, -1),
      journal.replace('"hold":320000', '"hold":0'),
      journal.replace('"attempt":2', '"attempt":1'),
      journal.replace('"maxBudgetMicros":500000', '"maxBudgetMicros":1000000'),
      journal.replace('"reservedMicros":320185', '"reservedMicros":185'),
    ])
      expect(() => auditComparisonJournal(tampered, expected)).toThrow();
    expect(() =>
      auditComparisonJournal(journal, {
        ...expected,
        history: { ...e.history, ledgerDigest: 'changed' },
      }),
    ).toThrow();
  } finally {
    network.mockRestore();
    await ledger.close();
    await rm(e.root, { recursive: true });
  }
});
it('proves a smaller shared output allowance cannot solve the full-context reservation problem and changes no live settings', () => {
  expect(outputLimitScenario(4000)).toEqual({
    maxOutputTokens: 4000,
    miniFullContextMicros: 318000,
    lunaFullContextMicros: 265500,
    safeToApplyToFrozenRun: false,
  });
  expect(outputLimitScenario(2048)).toMatchObject({
    miniFullContextMicros: 309216,
    lunaFullContextMicros: 264036,
    safeToApplyToFrozenRun: false,
  });
  expect(outputLimitScenario(1024)).toMatchObject({
    miniFullContextMicros: 304608,
    lunaFullContextMicros: 263268,
  });
  for (const output of [1, 1024, 2048, 4000]) {
    const scenario = outputLimitScenario(output);
    expect(scenario.miniFullContextMicros).toBeGreaterThan(179815);
    expect(scenario.lunaFullContextMicros).toBeGreaterThan(179815);
  }
  for (const output of [0, -1, 4001, 1.5, NaN])
    expect(() => outputLimitScenario(output)).toThrow();
});
