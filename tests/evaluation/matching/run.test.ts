import { test } from 'vitest';
import { mkdtemp, open, readdir, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { constants } from 'node:fs';
import { DATASET, REPEAT_CASES } from './dataset';
import { prepareCase, pipelineDigest, datasetDigest, digest } from './fixtures';
import {
  MODEL,
  MAX_REQUESTS,
  MAX_BUDGET_MICROS,
  RESERVE_MICROS,
  INPUT_TOKEN_CEILING,
  privateDirectory,
  privateJson,
  readApproval,
  BudgetLedger,
  analyzeOnce,
  waitForSmokeReview,
  budgetCheckpoint,
} from './harness';
import { MATCHING_CONTRACT_VERSION } from '../../../apps/web/src/server/matching-provider';

test(
  'prepare the evaluation or execute one explicitly authorized synthetic run',
  async () => {
    const root = resolve('test-results/phase6-1');
    await privateDirectory(root);
    const journals: string[] = [];
    for (const name of await readdir(root)) {
      if (!name.startsWith('live-')) continue;
      try {
        await access(resolve(root, name, 'budget.jsonl'));
        journals.push(resolve(root, name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    if (journals.length > 1)
      throw Error(
        'Multiple cumulative journals require reconciliation before dispatch.',
      );
    const previousBudget = journals.length
      ? await budgetCheckpoint(journals[0])
      : null;
    const prepared = [];
    for (const entry of DATASET) prepared.push(await prepareCase(entry));
    const preflight = prepared.every(
      (p) => p.state === (p.entry.blocked ? 'blocked' : 'ready'),
    );
    const ready = prepared.filter((p) => p.state === 'ready');
    // Original two calls consumed two slots. Recheck the rejected DOCX and a
    // different strong PDF, then unseen cases and the original case-14 repeat.
    const requestOrder = previousBudget
      ? [
          ...ready.map((p) => p.entry.id).filter((id) => id !== '01'),
          '14',
        ].slice(0, MAX_REQUESTS - previousBudget.attempts)
      : [...ready.map((p) => p.entry.id), ...REPEAT_CASES];
    const plan = {
      datasetDigest: datasetDigest(),
      pipelineDigest: await pipelineDigest(),
      provider: 'openai',
      model: MODEL,
      configurationVersion: MATCHING_CONTRACT_VERSION + '-luna-low',
      previousBudget,
      serviceTier: 'default',
      reasoningEffort: 'low',
      maxOutputTokens: 4000,
      timeoutMs: 30000,
      maxRequests: MAX_REQUESTS,
      maxBudgetMicros: MAX_BUDGET_MICROS,
      reservationMicrosPerRequest: RESERVE_MICROS,
      pricing: {
        inputUsdPerMillion: 0.1,
        cachedInputUsdPerMillion: 0.01,
        cacheWriteUsdPerMillion: 0.125,
        outputUsdPerMillion: 0.5,
        longContextThreshold: 272000,
        longContextInputMultiplier: 2,
        longContextOutputMultiplier: 1.5,
        checkedOn: '2026-10-16',
        conservativeInputTokenCeiling: INPUT_TOKEN_CEILING,
      },
      requestOrder,
      cases: prepared.map((p) => ({
        id: p.entry.id,
        format: p.entry.format,
        state: p.state,
        contentHash: p.contentHash,
      })),
    };
    const planDigest = digest(plan);
    if (process.env.FATS_EVAL_LIVE !== '1') {
      const directory = await mkdtemp(resolve(root, 'preparation-'));
      for (const p of prepared) {
        const file = await open(
          resolve(directory, p.entry.id + '.' + p.entry.format),
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_WRONLY |
            constants.O_NOFOLLOW,
          0o600,
        );
        try {
          await file.writeFile(p.bytes);
          await file.sync();
        } finally {
          await file.close();
        }
      }
      await privateJson(
        resolve(directory, 'review-sources.json'),
        prepared
          .filter((p) => p.sources)
          .map((p) => ({
            id: p.entry.id,
            digest: p.contentHash,
            sources: p.sources,
          })),
      );
      await privateJson(resolve(directory, 'plan.json'), {
        planDigest,
        plan,
        preflight,
        extractionTimings: prepared.map((p) => ({
          id: p.entry.id,
          ms: p.extractionMs,
        })),
        liveRequests: 0,
        liveResults: null,
      });
      console.log(
        JSON.stringify({
          mode: 'NONBILLABLE_PREPARATION',
          cases: prepared.length,
          ready: ready.length,
          blocked: prepared.length - ready.length,
          preflight,
          planDigest,
          directory,
        }),
      );
      if (
        !preflight ||
        requestOrder.length + (previousBudget?.attempts ?? 0) !== MAX_REQUESTS
      )
        throw Error(
          'Synthetic evaluation preflight failed. No live request was made.',
        );
      return;
    }
    // No network call (including credential/model probes) occurs before this gate.
    if (
      !preflight ||
      requestOrder.length + (previousBudget?.attempts ?? 0) !== MAX_REQUESTS
    )
      throw Error(
        'Synthetic evaluation preflight changed; obtain a new review.',
      );
    const path = process.env.FATS_EVAL_APPROVAL;
    if (!path)
      throw Error(
        'Explicit budget authorization and a private approval file are required.',
      );
    const approval = await readApproval(resolve(path), planDigest);
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key)
      throw Error(
        'Configure a private server-side OpenAI key after authorization. Never paste it into a report.',
      );
    const directory = resolve(root, 'live-' + approval.id);
    if (previousBudget) await mkdir(directory, { mode: 0o700 });
    const ledger = previousBudget
      ? await BudgetLedger.resume(previousBudget, approval)
      : await BudgetLedger.create(directory, approval);
    const outcomes = [];
    const smokeResultDigests: string[] = [];
    let smokeReview: { continue: boolean; reason: string } | null = null;
    try {
      if (previousBudget)
        await privateJson(
          resolve(directory, 'budget-link.json'),
          previousBudget,
        );
      await privateJson(
        resolve(directory, 'review-sources.json'),
        ready.map((p) => ({
          id: p.entry.id,
          digest: p.contentHash,
          sources: p.sources,
        })),
      );
      for (let i = 0; i < requestOrder.length; i++) {
        const p = prepared.find((p) => p.entry.id === requestOrder[i])!;
        if (!p.sources) throw Error('A blocked source cannot be dispatched.');
        const cumulativeAttempt = ledger.summary().attempts + 1;
        const result = await analyzeOnce({
          id: p.entry.id + '-' + cumulativeAttempt,
          sources: p.sources,
          gold: p.entry.gold,
          ledger,
          key,
          transport: fetch,
        });
        const snapshot = {
          ...result,
          sourceDigest: p.contentHash,
          extractionMs: p.extractionMs,
        };
        await privateJson(
          resolve(
            directory,
            String(cumulativeAttempt).padStart(2, '0') + '-result.json',
          ),
          snapshot,
        );
        if (i < 2) smokeResultDigests.push(digest(snapshot));
        outcomes.push({
          caseId: result.caseId,
          attempted: result.attempted,
          failure: result.failure,
          accepted: result.diagnostics?.applicationAccepted ?? false,
          latencyMs: result.latencyMs,
          usage: result.usage,
        });
        if (
          result.stop ||
          !result.attempted ||
          !result.diagnostics?.applicationAccepted
        )
          break;
        if (i === 1) {
          await privateJson(resolve(directory, 'smoke-pending.json'), {
            planDigest,
            resultDigests: smokeResultDigests,
            ledger: ledger.summary(),
          });
          console.log(
            JSON.stringify({
              mode: 'SMOKE_REVIEW_REQUIRED',
              directory,
              attempts: ledger.summary().attempts,
            }),
          );
          smokeReview = await waitForSmokeReview(
            directory,
            planDigest,
            smokeResultDigests,
          );
          if (!smokeReview.continue) break;
        }
      }
      await privateJson(resolve(directory, 'summary.json'), {
        mode: 'LIVE',
        planDigest,
        approval,
        phase: previousBudget ? 'post-fix' : 'initial',
        previousBudget,
        ledger: ledger.summary(),
        outcomes,
        manualReview: 'pending',
        invoiceCost: null,
        smokeReview,
      });
      console.log(
        JSON.stringify({
          mode: 'LIVE',
          ...ledger.summary(),
          directory,
          manualReview: 'pending',
        }),
      );
    } finally {
      await ledger.close();
    }
  },
  15 * 60 * 1000,
);
