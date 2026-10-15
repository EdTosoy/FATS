import {
  validateMatchResult,
  matchingSuggestion,
  requirementImportance,
  type MatchingSources,
} from '@fats/domain';
import type { GoldRequirement } from './dataset';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): value is ObjectValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value: ObjectValue, expected: string[]) =>
  Object.keys(value).sort().join(',') === expected.sort().join(',');
const citation = (value: unknown) =>
  object(value) &&
  keys(value, ['segmentId', 'quote']) &&
  typeof value.segmentId === 'string' &&
  typeof value.quote === 'string';
// Independent schema/citation diagnostics: passing these is not semantic proof.
export function inspectProposal(
  value: unknown,
  sources: MatchingSources,
  gold: GoldRequirement[],
) {
  const shapeValid =
    object(value) &&
    keys(value, ['requirements']) &&
    Array.isArray(value.requirements) &&
    value.requirements.length <= 12 &&
    value.requirements.every(
      (item) =>
        object(item) &&
        keys(item, ['job', 'classification', 'evidence']) &&
        citation(item.job) &&
        ['demonstrated', 'partial', 'undocumented', 'unclear'].includes(
          String(item.classification),
        ) &&
        Array.isArray(item.evidence) &&
        item.evidence.length <= 3 &&
        item.evidence.every(citation),
    );
  if (!shapeValid)
    return {
      schemaValid: false,
      citationCount: 0,
      validCitationCount: 0,
      applicationAccepted: false,
      requirements: [],
      missingGold: gold.map((g) => g.id),
      manualReview: 'pending' as const,
    };
  const rows = (
    value as {
      requirements: {
        job: { segmentId: string; quote: string };
        classification: string;
        evidence: { segmentId: string; quote: string }[];
      }[];
    }
  ).requirements;
  const schemaValid = rows.every((row) =>
    row.classification === 'undocumented'
      ? row.evidence.length === 0
      : ['demonstrated', 'partial'].includes(row.classification)
        ? row.evidence.length >= 1
        : true,
  );
  let citationCount = 0,
    validCitationCount = 0;
  const check = (
    ref: { segmentId: string; quote: string },
    kind: 'resume' | 'job',
  ) => {
    citationCount++;
    const exists =
      ref.quote.trim().length >= 2 &&
      !!sources[kind].find(
        (s) => s.id === ref.segmentId && s.text.includes(ref.quote),
      );
    if (exists) validCitationCount++;
    return exists;
  };
  const requirements = rows.map((item) => {
    const jobCitationValid = check(item.job, 'job');
    const evidenceCitationsValid = item.evidence
      .map((e) => check(e, 'resume'))
      .every(Boolean);
    const source = sources.job.find((s) => s.id === item.job.segmentId);
    const target = gold.find((g) => source?.text.includes(g.quote));
    return {
      goldId: target?.id ?? null,
      classification: item.classification,
      preliminaryExpectedClass:
        target?.expected.includes(
          item.classification as (typeof target.expected)[number],
        ) ?? false,
      computedImportance: requirementImportance(
        item.job.quote,
        source?.importance,
      ),
      preliminaryExpectedPriority:
        target?.importance ===
        requirementImportance(item.job.quote, source?.importance),
      completeRequirementQuote: target?.quote === item.job.quote,
      jobCitationValid,
      evidenceCitationsValid,
      // This is an anchor hint only; a human must read the entire context.
      goldEvidenceAnchorPresent:
        target?.evidence.some((anchor) =>
          item.evidence.some((e) => e.quote.includes(anchor)),
        ) ?? false,
      suggestion: matchingSuggestion(
        item.classification as Parameters<typeof matchingSuggestion>[0],
      ),
      review: {
        requirementAlignmentCorrect: null,
        classificationCorrect: null,
        evidenceSemanticallySupportsClassification: null,
        priorityCorrect: null,
        suggestionAppropriate: null,
        unsupportedClaim: null,
        notes: '',
      },
    };
  });
  let applicationAccepted = false;
  try {
    validateMatchResult(value, sources);
    applicationAccepted = true;
  } catch {
    /* Record failure without raw diagnostics. */
  }
  return {
    schemaValid,
    citationCount,
    validCitationCount,
    applicationAccepted,
    requirements,
    missingGold: gold
      .filter((g) => !requirements.some((r) => r.goldId === g.id))
      .map((g) => g.id),
    manualReview: 'pending' as const,
  };
}
