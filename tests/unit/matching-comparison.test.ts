import { it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  ComparisonLedger,
  checkComparisonApproval,
  slots,
  type ComparisonApproval,
} from '../evaluation/matching/comparison';
import {
  BudgetLedger,
  budgetCheckpoint,
  MODEL,
  MINI_MODEL,
  MAX_BUDGET_MICROS,
  usageCost,
  analyzeOnce,
} from '../evaluation/matching/harness';
import { DATASET } from '../evaluation/matching/dataset';
import { prepareCase } from '../evaluation/matching/fixtures';
const approval = (): ComparisonApproval => ({
  id: randomUUID(),
  authorized: true,
  syntheticOnly: true,
  models: [MODEL, MINI_MODEL],
  planDigest: 'frozen',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  maxRequests: 12,
  maxBudgetMicros: 500000,
});
async function environment() {
  const root = await mkdtemp('/tmp/fats-comparison-');
  const prior = await BudgetLedger.create(root + '/history', {
    id: randomUUID(),
    provider: 'openai',
    model: MODEL,
    planDigest: 'prior',
    authorized: true,
    syntheticOnly: true,
    maxRequests: 20,
    maxBudgetMicros: MAX_BUDGET_MICROS,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
  for (const charge of [179, 124, 151, 159]) {
    const n = await prior.reserve('history');
    await prior.settle(n, charge);
  }
  await prior.close();
  const history = await budgetCheckpoint(root + '/history');
  return {
    root,
    history,
    approval: approval(),
    close: () => rm(root, { recursive: true }),
  };
}
it('rejects missing, expired, wrong-model, changed-plan and excessive additional authorization', () => {
  const a = approval();
  expect(checkComparisonApproval(a, 'frozen')).toEqual(a);
  for (const change of [
    { maxRequests: 13 },
    { maxBudgetMicros: 500001 },
    { models: [MODEL] },
    { syntheticOnly: false },
    { authorized: false },
    { expiresAt: new Date(0).toISOString() },
    { extra: true },
  ])
    expect(() =>
      checkComparisonApproval({ ...a, ...change }, 'frozen'),
    ).toThrow();
  expect(() => checkComparisonApproval(a, 'other')).toThrow();
});
it('preserves historical charges, enforces twelve shared slots and cannot reset or fork authorization', async () => {
  const e = await environment();
  const prior = await readFile(e.root + '/history/budget.jsonl', 'utf8');
  const ledger = await ComparisonLedger.create(
    e.root + '/comparison',
    e.approval,
    e.history,
  );
  try {
    for (const [i, slot] of slots.entries()) {
      const arm = ledger.forModel(slot.model);
      expect(await arm.reserve(slot.caseId)).toBe(i + 1);
      await arm.settle(i + 1, 100);
      await expect(arm.settle(i + 1, 0)).rejects.toThrow();
    }
    expect(ledger.summary()).toMatchObject({
      attempts: 12,
      reservedMicros: 1200,
      combinedAttempts: 16,
      combinedConservativeMicros: 1813,
      unresolvedRequests: 0,
    });
    await expect(ledger.forModel(MODEL).reserve('03')).rejects.toThrow();
    expect(await readFile(e.root + '/history/budget.jsonl', 'utf8')).toBe(
      prior,
    );
    await expect(
      ComparisonLedger.create(e.root + '/fork', e.approval, e.history),
    ).rejects.toThrow();
  } finally {
    await ledger.close();
  }
  await expect(
    ComparisonLedger.create(e.root + '/reset', e.approval, e.history),
  ).rejects.toThrow();
  await e.close();
});
it('reserves model-specific worst cases and stops at unknown charges or the shared half-dollar ceiling', async () => {
  const e = await environment();
  const ledger = await ComparisonLedger.create(
    e.root + '/comparison',
    e.approval,
    e.history,
  );
  try {
    await expect(ledger.forModel(MINI_MODEL).reserve('03')).rejects.toThrow();
    const n = await ledger.forModel(MODEL).reserve('03');
    expect(ledger.summary().reservedMicros).toBe(270000);
    await expect(ledger.forModel(MINI_MODEL).reserve('03')).rejects.toThrow();
    await expect(ledger.settle(n, 270001)).rejects.toThrow();
    await ledger.settle(n, 200000);
    // Mini's $0.32 hold would exceed $0.50; no dispatch is allowed.
    await expect(ledger.forModel(MINI_MODEL).reserve('03')).rejects.toThrow();
    expect(ledger.summary()).toMatchObject({
      attempts: 1,
      reservedMicros: 200000,
      combinedConservativeMicros: 200613,
    });
  } finally {
    await ledger.close();
    await e.close();
  }
});
it('fails closed when the historical journal changes', async () => {
  const e = await environment();
  try {
    await expect(
      ComparisonLedger.create(e.root + '/comparison', e.approval, {
        ...e.history,
        reservedMicros: 0,
      }),
    ).rejects.toThrow('Historical');
  } finally {
    await e.close();
  }
});
it('prices Mini cached input and reasoning correctly, rejects impossible usage and bounds the full context', () => {
  expect(
    usageCost(
      {
        input_tokens: 1000,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 },
        output_tokens_details: { reasoning_tokens: 20 },
      },
      MINI_MODEL,
    ),
  ).toMatchObject({
    estimatedMicros: 1133,
    budgetMicros: 1200,
    reasoningTokens: 20,
  });
  expect(
    usageCost({ input_tokens: 400000, output_tokens: 4000 }, MINI_MODEL),
  ).toMatchObject({ estimatedMicros: 318000, budgetMicros: 318000 });
  expect(
    usageCost({ input_tokens: 400001, output_tokens: 0 }, MINI_MODEL),
  ).toBeNull();
  expect(
    usageCost(
      {
        input_tokens: 100,
        output_tokens: 1,
        input_tokens_details: { cached_tokens: 100, cache_write_tokens: 1 },
      },
      MINI_MODEL,
    ),
  ).toBeNull();
});
it('sends byte-identical prompts, sources and schemas with low reasoning in both model arms, retaining invalid results without retries', async () => {
  const e = await environment();
  const p = await prepareCase(DATASET[2]);
  const ledger = await ComparisonLedger.create(
    e.root + '/comparison',
    e.approval,
    e.history,
  );
  const bodies: unknown[] = [];
  let calls = 0;
  try {
    for (const model of [MODEL, MINI_MODEL] as const) {
      const proposal = {
        requirements: [
          {
            job: { segmentId: 'J003', quote: 'SQL required.' },
            classification: 'undocumented',
            evidence: [{ segmentId: 'R002', quote: p.sources!.resume[1].text }],
          },
        ],
      };
      const result = await analyzeOnce({
        id: '03',
        sources: p.sources!,
        gold: p.entry.gold,
        ledger: ledger.forModel(model),
        model,
        key: 'synthetic-key',
        transport: async (_url, init) => {
          calls++;
          expect(ledger.summary().attempts).toBe(calls);
          const body = JSON.parse(String(init?.body));
          expect(body).toMatchObject({
            model,
            reasoning: { effort: 'low' },
            store: false,
            service_tier: 'default',
            max_output_tokens: 4000,
          });
          delete body.model;
          bodies.push(body);
          return Response.json({
            model,
            status: 'completed',
            service_tier: 'default',
            usage: {
              input_tokens: 1000,
              output_tokens: 100,
              input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            },
            output: [
              {
                type: 'message',
                content: [
                  { type: 'output_text', text: JSON.stringify(proposal) },
                ],
              },
            ],
          });
        },
      });
      expect(result.proposal).toEqual(proposal);
      expect(result.diagnostics?.applicationAccepted).toBe(false);
      expect(result.diagnostics?.schemaValid).toBe(false);
      expect(result.stop).toBe(false);
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(calls).toBe(2);
    expect(ledger.summary().reservedMicros).toBe(1375);
  } finally {
    await ledger.close();
    await e.close();
  }
});
