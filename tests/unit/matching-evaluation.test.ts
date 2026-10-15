import { it, expect } from 'vitest';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { DATASET } from '../evaluation/matching/dataset';
import { prepareCase } from '../evaluation/matching/fixtures';
import { inspectProposal } from '../evaluation/matching/grading';
import {
  checkApproval,
  MODEL,
  BudgetLedger,
  budgetCheckpoint,
  replayBudget,
  analyzeOnce,
  usageCost,
  RESERVE_MICROS,
  MAX_BUDGET_MICROS,
  INPUT_TOKEN_CEILING,
  checkSmokeReview,
  waitForSmokeReview,
  privateJson,
  type Approval,
} from '../evaluation/matching/harness';
const minBudget = (requests: number) =>
  Math.min(MAX_BUDGET_MICROS, requests * RESERVE_MICROS);
const approval = (requests = 2, budget = minBudget(requests)): Approval => ({
  id: randomUUID(),
  provider: 'openai',
  model: MODEL,
  planDigest: 'frozen-plan',
  maxRequests: requests,
  maxBudgetMicros: budget,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
  authorized: true,
  syntheticOnly: true,
});
async function environment() {
  const root = await mkdtemp('/tmp/fats-eval-unit-');
  const ledger = await BudgetLedger.create(root + '/live', approval());
  return {
    root,
    ledger,
    close: async () => {
      await ledger.close();
      await rm(root, { recursive: true });
    },
  };
}
it('extracts all twenty real PDF/DOCX fixtures and locally blocks only the independently labelled source attacks', async () => {
  expect(DATASET).toHaveLength(20);
  expect(new Set(DATASET.map((e) => e.id)).size).toBe(20);
  expect(DATASET.filter((e) => e.format === 'pdf')).toHaveLength(10);
  expect(DATASET.filter((e) => e.format === 'docx')).toHaveLength(10);
  for (const entry of DATASET) {
    const p = await prepareCase(entry);
    expect(p.state, entry.id).toBe(entry.blocked ? 'blocked' : 'ready');
    if (p.sources) {
      expect(p.sources.resume.map((s) => s.text).join(' '), entry.id).toBe(
        entry.resume.join(' '),
      );
      for (const gold of entry.gold)
        expect(
          p.sources.job.some((s) => s.text.includes(gold.quote)),
          entry.id,
        ).toBe(true);
    }
  }
}, 20000);
it('fails closed on missing, stale, over-budget, wrong-model and changed-plan authorization', () => {
  const a = approval();
  expect(checkApproval(a, 'frozen-plan')).toEqual(a);
  for (const bad of [
    null,
    {},
    { ...a, authorized: false },
    { ...a, model: 'other' },
    { ...a, expiresAt: new Date(0).toISOString() },
    { ...a, maxRequests: 21 },
    { ...a, maxBudgetMicros: MAX_BUDGET_MICROS + 1 },
    { ...a, maxBudgetMicros: 1 },
    { ...a, extra: true },
  ])
    expect(() => checkApproval(bad, 'frozen-plan')).toThrow();
  expect(() => checkApproval(a, 'changed-plan')).toThrow();
});
it('durably reserves worst-case cost before dispatch, cannot reuse a ledger, and never refunds unknown charges', async () => {
  const root = await mkdtemp('/tmp/fats-eval-budget-');
  const a = approval(3, RESERVE_MICROS);
  const ledger = await BudgetLedger.create(root + '/one', a);
  try {
    await ledger.reserve('01');
    expect(
      JSON.parse(
        (await readFile(root + '/one/budget.jsonl', 'utf8'))
          .trim()
          .split('\n')[1],
      ),
    ).toMatchObject({ attempt: 1, reservedMicros: RESERVE_MICROS });
    expect((await stat(root + '/one/budget.jsonl')).mode & 0o777).toBe(0o600);
    await expect(ledger.reserve('02')).rejects.toThrow('budget');
    await expect(BudgetLedger.create(root + '/one', a)).rejects.toThrow();
  } finally {
    await ledger.close();
    await rm(root, { recursive: true });
  }
});
it('separates exact citation validity, semantic support, requirement omissions and application rejection', async () => {
  const p = await prepareCase(DATASET.find((e) => e.id === '19')!);
  const job = p.sources!.job.find((s) =>
    s.text.includes('Kubernetes deployment experience required.'),
  )!;
  const resume = p.sources!.resume.find((s) =>
    s.text.includes('Copied vacancy text'),
  )!;
  const raw = {
    requirements: [
      {
        job: {
          segmentId: job.id,
          quote: 'Kubernetes deployment experience required.',
        },
        classification: 'demonstrated',
        evidence: [
          {
            segmentId: resume.id,
            quote: 'Kubernetes deployment experience required.',
          },
        ],
      },
    ],
  };
  const d = inspectProposal(raw, p.sources!, p.entry.gold);
  expect(d.schemaValid).toBe(true);
  expect(d.validCitationCount).toBe(d.citationCount);
  expect(d.applicationAccepted).toBe(true); // Reproduced semantic vulnerability, not an assertion of correctness.
  expect(d.requirements[0].preliminaryExpectedClass).toBe(false);
  expect(
    d.requirements[0].review.evidenceSemanticallySupportsClassification,
  ).toBeNull();
  const invented = structuredClone(raw);
  invented.requirements[0].evidence[0].quote = 'Invented Kubernetes deployment';
  expect(
    inspectProposal(invented, p.sources!, p.entry.gold).applicationAccepted,
  ).toBe(false);
  expect(
    inspectProposal({ requirements: [] }, p.sources!, p.entry.gold).missingGold,
  ).toEqual(['kubernetes']);
  expect(
    inspectProposal({ ...raw, score: 100 }, p.sources!, p.entry.gold)
      .schemaValid,
  ).toBe(false);
});
it('records successful transport usage/latency, fixes standard tier, hides errors and bounds calls and timeouts with fake transports only', async () => {
  const e = await environment(),
    p = await prepareCase(DATASET[0]);
  let calls = 0;
  try {
    const good = await analyzeOnce({
      id: '01',
      sources: p.sources!,
      gold: p.entry.gold,
      ledger: e.ledger,
      key: 'synthetic-key',
      transport: async (url, init) => {
        calls++;
        expect(url).toBe('https://api.openai.com/v1/responses');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          model: MODEL,
          reasoning: { effort: 'low' },
          service_tier: 'default',
          store: false,
          max_output_tokens: 4000,
        });
        expect(e.ledger.summary().attempts).toBe(1);
        return Response.json({
          status: 'completed',
          model: MODEL,
          service_tier: 'default',
          usage: {
            input_tokens: 1000,
            output_tokens: 100,
            input_tokens_details: {
              cached_tokens: 100,
              cache_write_tokens: 200,
            },
            output_tokens_details: { reasoning_tokens: 20 },
          },
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '{"requirements":[]}' }],
            },
          ],
        });
      },
    });
    expect(good.failure).toBeNull();
    expect(good.usage?.inputTokens).toBe(1000);
    expect(good.usage?.estimatedMicros).toBe(146);
    expect(good.diagnostics?.missingGold).toHaveLength(2);
    const timeout = await analyzeOnce({
      id: '02',
      sources: p.sources!,
      gold: p.entry.gold,
      ledger: e.ledger,
      key: 'synthetic-key',
      timeoutMs: 1000,
      transport: async () => {
        calls++;
        return new Promise(() => {});
      },
    });
    expect(timeout.failure).toBe('timeout');
    expect(timeout.usage).toBeNull();
    const capped = await analyzeOnce({
      id: '03',
      sources: p.sources!,
      gold: p.entry.gold,
      ledger: e.ledger,
      key: 'synthetic-key',
      transport: async () => {
        calls++;
        throw Error('PRIVATE ERROR MUST NOT ESCAPE');
      },
    });
    expect(capped.attempted).toBe(false);
    expect(calls).toBe(2);
    expect(JSON.stringify(capped)).not.toContain('PRIVATE');
    expect(e.ledger.summary().reservedMicros).toBe(RESERVE_MICROS + 175);
  } finally {
    await e.close();
  }
  expect(usageCost({ input_tokens: 2, output_tokens: -1 })).toBeNull();
  expect(
    usageCost({
      input_tokens: 1,
      output_tokens: 1,
      input_tokens_details: { cached_tokens: 2 },
    }),
  ).toBeNull();
});
it('records HTTP refusal and invalid structured output without retries or raw error payloads', async () => {
  const e = await environment(),
    p = await prepareCase(DATASET[0]);
  let calls = 0;
  try {
    const failure = await analyzeOnce({
      id: '01',
      sources: p.sources!,
      gold: p.entry.gold,
      ledger: e.ledger,
      key: 'synthetic-key',
      transport: async () => {
        calls++;
        return Response.json({ error: 'PRIVATE' }, { status: 429 });
      },
    });
    expect(failure.stop).toBe(true);
    expect(failure.failure).toBe('unavailable');
    expect(failure.httpStatus).toBe(429);
    expect(JSON.stringify(failure)).not.toContain('PRIVATE');
    const invalid = await analyzeOnce({
      id: '02',
      sources: p.sources!,
      gold: p.entry.gold,
      ledger: e.ledger,
      key: 'synthetic-key',
      transport: async () => {
        calls++;
        return Response.json({
          status: 'completed',
          model: MODEL,
          service_tier: 'default',
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          },
          output: [
            {
              type: 'message',
              content: [
                { type: 'output_text', text: '{"requirements":[],"score":99}' },
              ],
            },
          ],
        });
      },
    });
    expect(invalid.diagnostics?.schemaValid).toBe(false);
    expect(invalid.diagnostics?.applicationAccepted).toBe(false);
    expect(calls).toBe(2);
    expect(invalid.usage?.estimatedMicros).toBe(20);
    expect(e.ledger.summary().reservedMicros).toBe(RESERVE_MICROS + 23);
  } finally {
    await e.close();
  }
});
it('exposes false negatives for valid paraphrases and truncated requirement false positives independently of source matching', async () => {
  const p = await prepareCase(DATASET.find((e) => e.id === '14')!),
    gold = p.entry.gold[0];
  const job = p.sources!.job.find((s) => s.text === gold.quote)!,
    resume = p.sources!.resume.find((s) => s.text.includes(gold.evidence[0]))!;
  const result = {
    requirements: [
      {
        job: { segmentId: job.id, quote: job.text },
        classification: 'demonstrated',
        evidence: [{ segmentId: resume.id, quote: resume.text }],
      },
    ],
  };
  const diagnostic = inspectProposal(result, p.sources!, p.entry.gold);
  expect(diagnostic.requirements[0].preliminaryExpectedClass).toBe(true);
  expect(diagnostic.validCitationCount).toBe(2);
  expect(diagnostic.applicationAccepted).toBe(false);
  const c = await prepareCase(DATASET.find((e) => e.id === '15')!);
  const j = c.sources!.job.find((s) => s.text === c.entry.gold[0].quote)!,
    r = c.sources!.resume.find((s) =>
      s.text.includes('Built Python projects'),
    )!;
  const shortened = {
    requirements: [
      {
        job: { segmentId: j.id, quote: 'Python' },
        classification: 'demonstrated',
        evidence: [{ segmentId: r.id, quote: r.text }],
      },
    ],
  };
  const d = inspectProposal(shortened, c.sources!, c.entry.gold);
  expect(d.applicationAccepted).toBe(true);
  expect(d.requirements[0].completeRequirementQuote).toBe(false);
  expect(d.requirements[0].preliminaryExpectedClass).toBe(false);
});
it('distinguishes malformed provider JSON without changing the baseline adapter failure code or retaining its body', async () => {
  const e = await environment(),
    p = await prepareCase(DATASET[0]);
  try {
    const outcome = await analyzeOnce({
      id: '01',
      sources: p.sources!,
      gold: p.entry.gold,
      ledger: e.ledger,
      key: 'synthetic-key',
      transport: async () =>
        Response.json({
          status: 'completed',
          model: MODEL,
          service_tier: 'default',
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          },
          output: [
            {
              type: 'message',
              content: [
                { type: 'output_text', text: 'PRIVATE MALFORMED OUTPUT' },
              ],
            },
          ],
        }),
    });
    expect(outcome.failure).toBe('unavailable');
    expect(outcome.formatFailure).toBe('result_json');
    expect(JSON.stringify(outcome)).not.toContain('PRIVATE MALFORMED');
    expect(outcome.proposal).toBeNull();
  } finally {
    await e.close();
  }
});
it('keeps dispatch paused after two results until their exact snapshots receive a recorded manual review', async () => {
  const root = await mkdtemp('/tmp/fats-eval-smoke-');
  const proof = {
    planDigest: 'plan',
    resultDigests: ['first', 'second'],
    continue: true,
    reviewer: 'Deterministic test reviewer',
    notes: 'Both synthetic result snapshots inspected.',
  };
  try {
    let requests = 2;
    const waiting = waitForSmokeReview(root, 'plan', ['first', 'second'], {
      timeoutMs: 1000,
      pollMs: 5,
    }).then((result) => {
      if (result.continue) requests++;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests).toBe(2);
    await privateJson(root + '/smoke-review.json', proof);
    expect(await waiting).toEqual({
      continue: true,
      reason: 'reviewed_continue',
    });
    expect(requests).toBe(3);
    expect(() =>
      checkSmokeReview(
        { ...proof, resultDigests: ['different', 'second'] },
        'plan',
        ['first', 'second'],
      ),
    ).toThrow();
    expect(() =>
      checkSmokeReview(proof, 'different', ['first', 'second']),
    ).toThrow();
  } finally {
    await rm(root, { recursive: true });
  }
});
it('stops at a declined, invalid, or timed-out smoke review without permission to continue', async () => {
  const root = await mkdtemp('/tmp/fats-eval-smoke-stop-');
  try {
    expect(
      await waitForSmokeReview(root, 'plan', ['a', 'b'], {
        timeoutMs: 15,
        pollMs: 5,
      }),
    ).toEqual({ continue: false, reason: 'review_timeout' });
    const proof = {
      planDigest: 'plan',
      resultDigests: ['a', 'b'],
      continue: false,
      reviewer: 'Deterministic test reviewer',
      notes: 'Stop because result integrity failed.',
    };
    await privateJson(root + '/smoke-review.json', proof);
    expect(await waitForSmokeReview(root, 'plan', ['a', 'b'])).toEqual({
      continue: false,
      reason: 'reviewed_stop',
    });
    expect(await waitForSmokeReview(root, 'wrong-plan', ['a', 'b'])).toEqual({
      continue: false,
      reason: 'invalid_review',
    });
  } finally {
    await rm(root, { recursive: true });
  }
});

it('settles only verified usage durably, preserves the request ceiling and refuses duplicate or excessive settlements', async () => {
  const root = await mkdtemp('/tmp/fats-luna-settlement-');
  const ledger = await BudgetLedger.create(
    root + '/live',
    approval(20, MAX_BUDGET_MICROS),
  );
  try {
    for (let i = 1; i <= 20; i++) {
      const attempt = await ledger.reserve('synthetic-' + i);
      expect(attempt).toBe(i);
      expect(ledger.summary().reservedMicros).toBeLessThanOrEqual(
        MAX_BUDGET_MICROS,
      );
      await expect(
        ledger.settle(attempt, RESERVE_MICROS + 1),
      ).rejects.toThrow();
      await ledger.settle(attempt, 1000);
      await expect(ledger.settle(attempt, 0)).rejects.toThrow();
    }
    expect(ledger.summary()).toEqual({
      attempts: 20,
      reservedMicros: 20000,
      settledMicros: 20000,
      unresolvedRequests: 0,
    });
    await expect(ledger.reserve('twenty-first')).rejects.toThrow();
    const lines = (await readFile(root + '/live/budget.jsonl', 'utf8'))
      .trim()
      .split('\n');
    expect(lines).toHaveLength(41);
    expect(JSON.parse(lines[40])).toMatchObject({
      attempt: 20,
      settledMicros: 1000,
      reservedMicros: 20000,
    });
  } finally {
    await ledger.close();
    await rm(root, { recursive: true });
  }
});
it('accounts for Luna cache writes and reasoning within output tokens, bounds unknown usage and covers long-context pricing', () => {
  expect(
    usageCost({
      input_tokens: 1000,
      output_tokens: 100,
      input_tokens_details: { cached_tokens: 100, cache_write_tokens: 200 },
      output_tokens_details: { reasoning_tokens: 20 },
    }),
  ).toMatchObject({
    estimatedMicros: 146,
    budgetMicros: 175,
    cacheWriteTokens: 200,
    reasoningTokens: 20,
    accounting: 'reported_token_rates',
  });
  expect(usageCost({ input_tokens: 1000, output_tokens: 100 })).toMatchObject({
    estimatedMicros: 175,
    budgetMicros: 175,
    cacheWriteTokens: null,
    accounting: 'cache_write_upper_bound',
  });
  expect(
    usageCost({ input_tokens: INPUT_TOKEN_CEILING, output_tokens: 4000 })
      ?.budgetMicros,
  ).toBe(265500);
  expect(RESERVE_MICROS).toBeGreaterThanOrEqual(265500);
  for (const usage of [
    { input_tokens: INPUT_TOKEN_CEILING + 1, output_tokens: 1 },
    { input_tokens: 1, output_tokens: 4001 },
    {
      input_tokens: 1,
      output_tokens: 1,
      input_tokens_details: { cached_tokens: 1, cache_write_tokens: 1 },
    },
    {
      input_tokens: 1,
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 2 },
    },
  ])
    expect(usageCost(usage)).toBeNull();
});
it('halts on missing usage, model substitution or unexpected pricing tier without releasing the reservation', async () => {
  for (const change of [
    { usage: null },
    { model: 'other' },
    { service_tier: 'priority' },
  ]) {
    const e = await environment(),
      p = await prepareCase(DATASET[0]);
    let calls = 0;
    try {
      const result = await analyzeOnce({
        id: '01',
        sources: p.sources!,
        gold: p.entry.gold,
        key: 'synthetic-key',
        ledger: e.ledger,
        transport: async () => {
          calls++;
          return Response.json({
            status: 'completed',
            model: MODEL,
            service_tier: 'default',
            usage: { input_tokens: 100, output_tokens: 20 },
            output: [],
            ...change,
          });
        },
      });
      expect(result.stop).toBe(true);
      expect(result.failure).toBe('invalid_output');
      expect(calls).toBe(1);
      expect(e.ledger.summary()).toMatchObject({
        reservedMicros: RESERVE_MICROS,
        unresolvedRequests: 1,
        settledMicros: 0,
      });
    } finally {
      await e.close();
    }
  }
});

it('preserves the observed Luna smoke failure: correct labels and exact negative context can still violate the application evidence contract', async () => {
  const p = await prepareCase(DATASET[1]);
  // Exact synthetic proposal from the frozen live baseline, not a new model call.
  const proposal = {
    requirements: [
      {
        job: {
          segmentId: 'J003',
          quote: 'HTML, CSS and JavaScript projects required.',
        },
        classification: 'partial',
        evidence: [
          {
            segmentId: 'R002',
            quote:
              'Built a static HTML and CSS portfolio for a school assignment.',
          },
          {
            segmentId: 'R003',
            quote: 'No JavaScript or React project listed.',
          },
        ],
      },
      {
        job: { segmentId: 'J004', quote: 'React experience preferred.' },
        classification: 'undocumented',
        evidence: [
          {
            segmentId: 'R003',
            quote: 'No JavaScript or React project listed.',
          },
        ],
      },
    ],
  };
  const diagnostic = inspectProposal(proposal, p.sources!, p.entry.gold);
  expect(diagnostic.schemaValid).toBe(false);
  expect(diagnostic.validCitationCount).toBe(5);
  expect(diagnostic.requirements.every((r) => r.preliminaryExpectedClass)).toBe(
    true,
  );
  expect(diagnostic.missingGold).toEqual([]);
  expect(diagnostic.applicationAccepted).toBe(false);
});

it('continues the same durable journal without resetting baseline attempts or charges, and serializes continuation', async () => {
  const root = await mkdtemp('/tmp/fats-eval-resume-');
  const a = approval(20, MAX_BUDGET_MICROS);
  const original = await BudgetLedger.create(root + '/live', a);
  await original.reserve('01');
  await original.settle(1, 179);
  await original.reserve('02');
  await original.settle(2, 124);
  await original.close();
  const checkpoint = await budgetCheckpoint(root + '/live');
  expect(checkpoint).toMatchObject({
    attempts: 2,
    reservedMicros: 303,
    settledMicros: 303,
    unresolvedRequests: 0,
  });
  const baseline = await readFile(root + '/live/budget.jsonl', 'utf8');
  const resumed = await BudgetLedger.resume(checkpoint, a);
  try {
    await expect(BudgetLedger.resume(checkpoint, a)).rejects.toThrow();
    expect(await resumed.reserve('post-fix')).toBe(3);
    await resumed.settle(3, 100);
    expect(resumed.summary()).toMatchObject({
      attempts: 3,
      reservedMicros: 403,
    });
  } finally {
    await resumed.close();
  }
  await expect(BudgetLedger.resume(checkpoint, a)).rejects.toThrow('Stale');
  const final = await readFile(root + '/live/budget.jsonl', 'utf8');
  expect(final.startsWith(baseline)).toBe(true);
  expect(replayBudget(final)).toMatchObject({
    attempts: 3,
    reservedMicros: 403,
    unresolvedRequests: 0,
  });
  expect(() => replayBudget(final.slice(0, -1))).toThrow();
  const tampered = final.replace('"attempt":3', '"attempt":1');
  expect(() => replayBudget(tampered)).toThrow();
  await rm(root, { recursive: true });
});
it('refuses to continue unknown charges or a cumulative request ceiling even with a new approval', async () => {
  for (const settle of [false, true]) {
    const root = await mkdtemp('/tmp/fats-eval-resume-limit-');
    const a = approval(1, RESERVE_MICROS);
    const original = await BudgetLedger.create(root + '/live', a);
    await original.reserve('01');
    if (settle) await original.settle(1, 100);
    await original.close();
    const checkpoint = await budgetCheckpoint(root + '/live');
    await expect(
      BudgetLedger.resume(checkpoint, approval(20, MAX_BUDGET_MICROS)),
    ).rejects.toThrow();
    await expect(BudgetLedger.resume(checkpoint, a)).rejects.toThrow();
    expect((await budgetCheckpoint(root + '/live')).ledgerDigest).toBe(
      checkpoint.ledgerDigest,
    );
    await rm(root, { recursive: true });
  }
});

it('records observed academic-skill false negatives even when the repaired schema, exact citations and application validation pass', async () => {
  const p = await prepareCase(DATASET[2]);
  const observed = {
    requirements: [
      {
        job: { segmentId: 'J003', quote: 'SQL required.' },
        classification: 'partial',
        evidence: [
          {
            segmentId: 'R002',
            quote:
              'Academic project: SQL queries cleaned survey tables with duplicate records.',
          },
        ],
      },
      {
        job: { segmentId: 'J004', quote: 'Excel pivot tables preferred.' },
        classification: 'partial',
        evidence: [
          {
            segmentId: 'R003',
            quote:
              'Excel pivot tables summarized a synthetic campus transport survey.',
          },
        ],
      },
    ],
  };
  const diagnostic = inspectProposal(observed, p.sources!, p.entry.gold);
  expect(diagnostic.schemaValid).toBe(true);
  expect(diagnostic.applicationAccepted).toBe(true);
  expect(diagnostic.validCitationCount).toBe(4);
  expect(diagnostic.missingGold).toEqual([]);
  expect(
    diagnostic.requirements.every((r) => r.preliminaryExpectedClass === false),
  ).toBe(true);
  expect(p.entry.gold.map((g) => g.expected)).toEqual([
    ['demonstrated'],
    ['demonstrated'],
  ]);
});
