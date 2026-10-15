import { it, expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { validateMatchResult } from '@fats/domain';
import { originalProviderSource } from '../evaluation/matching/comparison';
import plan from '../evaluation/matching/comparison-plan.v1.json';
import { DATASET } from '../evaluation/matching/dataset';
import additional from '../evaluation/matching/comparison-fixtures.v1.json';
import type { EvaluationCase } from '../evaluation/matching/dataset';
import { prepareCase, datasetDigest } from '../evaluation/matching/fixtures';
import {
  MATCHING_CONTRACT_VERSION,
  MATCHING_INSTRUCTIONS,
  MATCHING_SCHEMA,
} from '../../apps/web/src/server/matching-provider';

it('binds the unapproved comparison to the unchanged shared contract, rubric and cumulative ceilings', async () => {
  expect(plan.status).toBe('proposed_unapproved');
  expect(plan.executionReady).toBe(false);
  expect(plan.liveRequestsAuthorized).toBe(false);
  expect(plan.datasetDigest).toBe(datasetDigest());
  expect(plan.contractVersion).toBe(MATCHING_CONTRACT_VERSION);
  expect(createHash('sha256').update(MATCHING_INSTRUCTIONS).digest('hex')).toBe(
    plan.sharedContractSha256.instructions,
  );
  expect(
    createHash('sha256').update(JSON.stringify(MATCHING_SCHEMA)).digest('hex'),
  ).toBe(plan.sharedContractSha256.schemaJson);
  for (const [path, hash] of Object.entries(plan.sharedSourceSha256))
    expect(
      createHash('sha256')
        .update(
          path.endsWith('/matching-provider.ts')
            ? originalProviderSource(await readFile(path, 'utf8'))
            : await readFile(path),
        )
        .digest('hex'),
      path,
    ).toBe(hash);
  expect(plan.models.map((model) => model.id)).toEqual([
    'gpt-6-luna',
    'gpt-5.4-mini-2026-03-17',
  ]);
  expect(plan.requestSettings.reasoning.effort).toBe('low');
  expect(plan.requestSettings.store).toBe(false);
  expect(plan.requestSettings.automaticRetries).toBe(0);
  expect(plan.requestSettings.tools).toEqual([]);
  expect(plan.requestPairs).toHaveLength(6);
  for (const pair of plan.requestPairs)
    expect([...pair.models].sort()).toEqual(
      plan.models.map((m) => m.id).sort(),
    );
  expect(
    plan.requestPairs.filter((pair) => pair.models[0] === 'gpt-6-luna'),
  ).toHaveLength(3);
  const checkpoint = plan.existingCheckpoint,
    limits = plan.proposedLimits;
  expect(limits.additionalRequests).toBe(plan.requestPairs.length * 2);
  expect(checkpoint.cumulativeAttempts + limits.additionalRequests).toBe(
    limits.cumulativeRequestCeilingAfterExperiment,
  );
  expect(limits.cumulativeRequestCeilingAfterExperiment).toBeLessThanOrEqual(
    checkpoint.originalRequestCeiling,
  );
  expect(
    checkpoint.conservativeBudgetMicros + limits.additionalBudgetMicros,
  ).toBe(limits.cumulativeBudgetCeilingMicros);
  expect(limits.cumulativeBudgetCeilingMicros).toBeLessThanOrEqual(
    checkpoint.originalBudgetMicros,
  );
});
it('reconstructs identical local PDF/DOCX sources and frozen labels for both model arms without network access', async () => {
  const network = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(
      new Error('Network calls prohibited in offline comparison preparation.'),
    );
  try {
    let targets = 0;
    for (const planned of plan.cases) {
      const entries: EvaluationCase[] = [
        ...DATASET,
        ...(additional.cases as EvaluationCase[]),
      ];
      const entry = entries.find((entry) => entry.id === planned.id)!;
      const prepared = await prepareCase(entry);
      expect(prepared.state).toBe('ready');
      expect(prepared.contentHash, planned.id).toBe(planned.sourceDigest);
      expect(
        entry.gold.map((gold) => ({
          id: gold.id,
          classification: gold.expected[0],
        })),
      ).toEqual(planned.expected);
      targets += entry.gold.length;
    }
    expect(targets).toBe(plan.scoring.frozenPrimaryTargetsPerModel);
    expect(
      plan.cases.filter((entry) => !entry.previousLiveExposure),
    ).toHaveLength(5);
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
  }
}, 20000);
it('shows that the validator permits documented academic skills but rejects invented paid-work duration', async () => {
  const p = await prepareCase(DATASET.find((entry) => entry.id === '03')!);
  const sources = p.sources!;
  const requirements = sources.job
    .filter((row) => row.id === 'J003' || row.id === 'J004')
    .map((job, i) => ({
      job: { segmentId: job.id, quote: job.text },
      classification: 'demonstrated',
      evidence: [
        {
          segmentId: sources.resume[i + 1].id,
          quote: sources.resume[i + 1].text,
        },
      ],
    }));
  // Diagnostic counterfactual fixture only: never relabel or mutate live results.
  expect(
    validateMatchResult({ requirements }, sources).requirements.map(
      (row) => row.classification,
    ),
  ).toEqual(['demonstrated', 'demonstrated']);
  const professional = structuredClone(sources);
  professional.job = [
    { ...professional.job[2], text: '2 years of paid SQL work required.' },
  ];
  const work = {
    ...requirements[0],
    job: { segmentId: 'J003', quote: professional.job[0].text },
  };
  expect(() =>
    validateMatchResult({ requirements: [work] }, professional),
  ).toThrow();
  expect(
    validateMatchResult(
      { requirements: [{ ...work, classification: 'partial' }] },
      professional,
    ).requirements[0].classification,
  ).toBe('partial');
});
