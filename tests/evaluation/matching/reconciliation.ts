// Read-only audit/proposal calculations. This module cannot dispatch, settle,
// refund, continue or overwrite a ledger. No provider key is read.
import { MODEL, MINI_MODEL, usageCost } from './harness';
import {
  reservations,
  slots,
  COMPARISON_BUDGET_MICROS,
  COMPARISON_REQUESTS,
} from './comparison';
import { digest } from './fixtures';
type History = {
  ledgerDigest: string;
  attempts: number;
  reservedMicros: number;
  unresolvedRequests: number;
};
export function auditComparisonJournal(
  journal: string,
  expected: { planDigest: string; history: History },
) {
  if (!journal.endsWith('\n') || Buffer.byteLength(journal) > 128000)
    throw Error('Incomplete comparison journal.');
  const [header, ...rows] = journal
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line));
  const a = header.approval;
  if (
    !a ||
    a.planDigest !== expected.planDigest ||
    a.authorized !== true ||
    a.syntheticOnly !== true ||
    a.maxRequests !== COMPARISON_REQUESTS ||
    a.maxBudgetMicros !== COMPARISON_BUDGET_MICROS ||
    digest(a.models) !== digest([MODEL, MINI_MODEL]) ||
    header.history?.ledgerDigest !== expected.history.ledgerDigest ||
    header.history?.attempts !== expected.history.attempts ||
    header.history?.reservedMicros !== expected.history.reservedMicros ||
    header.history?.unresolvedRequests !== 0 ||
    expected.history.unresolvedRequests !== 0 ||
    digest(header.reservations) !== digest(reservations) ||
    digest(header.slots) !== digest(slots)
  )
    throw Error('Comparison header or historical checkpoint changed.');
  let attempts = 0,
    reservedMicros = 0,
    settledMicros = 0;
  const pending = new Map<number, number>();
  for (const row of rows) {
    if ('caseId' in row) {
      const slot = slots[attempts];
      if (
        pending.size ||
        !slot ||
        row.attempt !== attempts + 1 ||
        row.caseId !== slot.caseId ||
        row.model !== slot.model ||
        row.hold !== reservations[slot.model] ||
        row.reservedMicros !== reservedMicros + row.hold ||
        row.reservedMicros > COMPARISON_BUDGET_MICROS
      )
        throw Error('Invalid comparison reservation.');
      attempts++;
      reservedMicros = row.reservedMicros;
      pending.set(attempts, row.hold);
    } else {
      const hold = pending.get(row.attempt);
      if (
        hold === undefined ||
        !Number.isInteger(row.settledMicros) ||
        row.settledMicros < 0 ||
        row.settledMicros > hold ||
        row.reservedMicros !== reservedMicros - hold + row.settledMicros
      )
        throw Error('Invalid comparison settlement.');
      reservedMicros = row.reservedMicros;
      settledMicros += row.settledMicros;
      pending.delete(row.attempt);
    }
  }
  const remainingBudgetMicros = COMPARISON_BUDGET_MICROS - reservedMicros;
  const next = slots[attempts];
  return {
    attempts,
    reservedMicros,
    settledMicros,
    unresolvedRequests: pending.size,
    unresolvedMicros: [...pending.values()].reduce(
      (sum, hold) => sum + hold,
      0,
    ),
    remainingRequests: COMPARISON_REQUESTS - attempts,
    remainingBudgetMicros,
    combinedAttempts: expected.history.attempts + attempts,
    combinedConservativeMicros:
      expected.history.reservedMicros + reservedMicros,
    nextSlot: next ?? null,
    nextReservationMicros: next ? reservations[next.model] : null,
    budgetAllowsNext:
      !!next &&
      !pending.size &&
      remainingBudgetMicros >= reservations[next.model],
    // Offline audit never conveys live authorization, even with enough funds.
    liveAuthorized: false as const,
  };
}
export function outputLimitScenario(maxOutputTokens: number) {
  if (
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < 1 ||
    maxOutputTokens > 4000
  )
    throw Error('Invalid proposed output limit.');
  return {
    maxOutputTokens,
    miniFullContextMicros: usageCost(
      { input_tokens: 400000, output_tokens: maxOutputTokens },
      MINI_MODEL,
    )!.budgetMicros,
    lunaFullContextMicros: usageCost(
      { input_tokens: 1050000, output_tokens: maxOutputTokens },
      MODEL,
    )!.budgetMicros,
    // A cost calculation cannot establish enough reasoning/JSON space or make
    // new settings comparable with completed 4,000-token baseline requests.
    safeToApplyToFrozenRun: false as const,
  };
}
