import { test } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ComparisonLedger,
  prepareComparison,
  readComparisonApproval,
  slots,
} from './comparison';
import {
  analyzeOnce,
  privateDirectory,
  privateJson,
  waitForSmokeReview,
} from './harness';
import { digest } from './fixtures';

test(
  'run the authorized frozen paired comparison without retries',
  async () => {
    const { prepared, plan, planDigest, history } = await prepareComparison();
    const root = resolve('test-results/phase6-1');
    await privateDirectory(root);
    if (process.env.FATS_COMPARISON_LIVE !== '1') {
      const directory = await mkdtemp(resolve(root, 'comparison-preparation-'));
      await privateJson(resolve(directory, 'plan.json'), { planDigest, plan });
      console.log(
        JSON.stringify({
          mode: 'NONBILLABLE_COMPARISON_PREFLIGHT',
          directory,
          planDigest,
          cases: prepared.length,
          requests: slots.length,
        }),
      );
      return;
    }
    if (!process.env.FATS_COMPARISON_APPROVAL)
      throw Error('Private plan-bound comparison approval required.');
    const approval = await readComparisonApproval(
      resolve(process.env.FATS_COMPARISON_APPROVAL),
      planDigest,
    );
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw Error('Private server OpenAI configuration unavailable.');
    const directory = resolve(root, 'comparison-' + approval.id);
    const ledger = await ComparisonLedger.create(directory, approval, history);
    const outcomes = [];
    const resultDigests: string[] = [];
    let smokeReview = null;
    try {
      await privateJson(resolve(directory, 'plan.json'), {
        planDigest,
        plan,
        approval,
      });
      await privateJson(
        resolve(directory, 'review-sources.json'),
        prepared.map((p) => ({
          id: p.entry.id,
          sourceDigest: p.contentHash,
          sources: p.sources,
          gold: p.entry.gold,
        })),
      );
      for (const [i, slot] of slots.entries()) {
        const p = prepared.find((p) => p.entry.id === slot.caseId)!;
        const result = await analyzeOnce({
          id: slot.caseId,
          model: slot.model,
          sources: p.sources!,
          gold: p.entry.gold,
          ledger: ledger.forModel(slot.model),
          key,
          transport: fetch,
        });
        const snapshot = {
          ...result,
          model: slot.model,
          attempt: i + 1,
          historicalAttempt: history.attempts + i + 1,
          sourceDigest: p.contentHash,
          extractionMs: p.extractionMs,
        };
        await privateJson(
          resolve(directory, String(i + 1).padStart(2, '0') + '-result.json'),
          snapshot,
        );
        outcomes.push({
          attempt: i + 1,
          model: slot.model,
          caseId: slot.caseId,
          accepted: result.diagnostics?.applicationAccepted ?? false,
          failure: result.failure,
          latencyMs: result.latencyMs,
          usage: result.usage,
        });
        if (i < 2) resultDigests.push(digest(snapshot));
        // Invalid quality results are retained and scored. Unknown usage, privacy,
        // transport/accounting guards or non-dispatch stop the comparison.
        if (
          result.stop ||
          !result.attempted ||
          !result.usage ||
          ledger.summary().unresolvedRequests
        )
          break;
        if (i === 1) {
          await privateJson(resolve(directory, 'smoke-pending.json'), {
            planDigest,
            resultDigests,
            ledger: ledger.summary(),
          });
          console.log(
            JSON.stringify({
              mode: 'COMPARISON_PAIR_REVIEW_REQUIRED',
              directory,
              ...ledger.summary(),
            }),
          );
          smokeReview = await waitForSmokeReview(
            directory,
            planDigest,
            resultDigests,
          );
          if (!smokeReview.continue) break;
        }
      }
      await privateJson(resolve(directory, 'summary.json'), {
        planDigest,
        history,
        ledger: ledger.summary(),
        outcomes,
        smokeReview,
        manualReview: 'pending',
        invoiceCost: null,
      });
      console.log(
        JSON.stringify({
          mode: 'COMPARISON_COMPLETE',
          directory,
          ...ledger.summary(),
        }),
      );
    } finally {
      await ledger.close();
    }
  },
  15 * 60 * 1000,
);
