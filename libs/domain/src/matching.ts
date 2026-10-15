export const MATCHING_VERSION = 'matching-v1';
export const MAX_MATCHING_TEXT = 24000;
export const MAX_MATCHING_BYTES = 48000;
export const MATCH_CLASSES = [
  'demonstrated',
  'partial',
  'undocumented',
  'unclear',
] as const;
export type MatchClass = (typeof MATCH_CLASSES)[number];
export type Importance = 'mandatory' | 'preferred' | 'unclear';
export interface SourceSegment {
  id: string;
  text: string;
  location: string;
  importance: Importance;
}
export interface MatchingSources {
  resume: SourceSegment[];
  job: SourceSegment[];
  warnings: string[];
}
export interface Evidence {
  segmentId: string;
  quote: string;
  start: number;
  end: number;
}
export interface RequirementMatch {
  job: Evidence;
  importance: Importance;
  classification: MatchClass;
  evidence: Evidence[];
}
export interface MatchResult {
  requirements: RequirementMatch[];
}
export interface MatchingConfig {
  provider: string;
  model: string;
  version: string;
}
export interface MatchPreview {
  id: string;
  applicationId: string;
  versionId: string;
  jobRevision: string;
  jobHash: string;
  sources: MatchingSources;
  configuration: MatchingConfig;
  expiresAt: string;
}
export interface MatchingReport {
  id: string;
  applicationId: string;
  versionId: string;
  jobRevision: string;
  jobHash: string;
  configuration: MatchingConfig;
  sources: MatchingSources | null;
  result: MatchResult | null;
  status: 'running' | 'complete' | 'failed';
  failure: string | null;
  createdAt: string;
  outdated: boolean;
}
export class MatchingValidationError extends Error {}
const unsafeInstructions =
  /ignore\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions|prompts)|(?:system|developer|assistant)\s*:\s*|<\/?(?:system|developer|assistant)>|reveal\s+(?:the\s+)?(?:api\s*key|secret)|(?:classify|mark)\s+(?:everything|all\s+(?:skills|requirements))\s+as\s+(?:matched|demonstrated)/i;
export function checkUntrustedText(text: string) {
  if (unsafeInstructions.test(text))
    throw new MatchingValidationError(
      'This text contains instruction-like content. Remove those instructions from the saved job description or upload a clean resume before comparing.',
    );
}
export function requirementImportance(
  text: string,
  heading: Importance = 'unclear',
): Importance {
  if (/\b(?:not required|no .{0,25}required|optional)\b/i.test(text))
    return 'unclear';
  if (
    /\b(?:prefer(?:red|ably)?|nice[- ]to[- ]have|desirable|bonus|advantage)\b/i.test(
      text,
    )
  )
    return 'preferred';
  if (/\b(?:must|required|mandatory|essential|minimum)\b/i.test(text))
    return 'mandatory';
  return heading;
}
export function sourceSegments(
  lines: { text: string; location: string }[],
  kind: 'resume' | 'job',
  name = '',
): { segments: SourceSegment[]; redacted: boolean } {
  const segments: SourceSegment[] = [];
  let heading: Importance = 'unclear',
    redacted = false;
  for (let i = 0; i < lines.length; i++) {
    let text = lines[i].text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    checkUntrustedText(text);
    const original = text;
    if (
      kind === 'resume' &&
      ((i === 0 && /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,3}$/.test(text)) ||
        /\b(?:address|date of birth|birthday|civil status|nationality)\s*:/i.test(
          text,
        ))
    ) {
      redacted = true;
      continue;
    }
    if (name.trim().length > 2)
      text = text.replace(
        new RegExp(name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
        '[name removed]',
      );
    text = text
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removed]')
      .replace(/(?:https?:\/\/|www\.)\S+/gi, '[link removed]')
      .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, '[number removed]');
    if (text !== original) redacted = true;
    if (!text.replace(/\[(?:name|email|link|number) removed\]/g, '').trim())
      continue;
    if (
      kind === 'job' &&
      text.length < 100 &&
      /^(?:required|minimum|mandatory|essential|preferred|nice[- ]to[- ]have)\b.*:?$/i.test(
        text,
      )
    )
      heading = requirementImportance(text);
    segments.push({
      id:
        (kind === 'resume' ? 'R' : 'J') +
        String(segments.length + 1).padStart(3, '0'),
      text,
      location: lines[i].location,
      importance:
        kind === 'job' ? requirementImportance(text, heading) : 'unclear',
    });
  }
  if (
    segments.length > 200 ||
    segments.reduce((n, s) => n + s.text.length, 0) > MAX_MATCHING_TEXT
  )
    throw new MatchingValidationError(
      'This text exceeds the comparison limit. Use a shorter resume or job description; nothing has been sent.',
    );
  return { segments, redacted };
}
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== keys.sort().join(',')
  )
    throw new MatchingValidationError(
      'The AI response did not match the required structure. No report was accepted.',
    );
  return value as Record<string, unknown>;
}
function citation(value: unknown, segments: SourceSegment[]): Evidence {
  const item = record(value, ['segmentId', 'quote']);
  if (
    typeof item.segmentId !== 'string' ||
    typeof item.quote !== 'string' ||
    item.quote.trim().length < 2 ||
    item.quote.length > 600
  )
    throw new MatchingValidationError(
      'The AI supplied invalid evidence. No report was accepted.',
    );
  const source = segments.find((s) => s.id === item.segmentId),
    start = source?.text.indexOf(item.quote) ?? -1;
  if (
    !source ||
    start < 0 ||
    /\[(?:name|email|link|number) removed\]/.test(item.quote)
  )
    throw new MatchingValidationError(
      'The AI cited text that is absent from the reviewed sources. No report was accepted.',
    );
  checkUntrustedText(item.quote);
  return {
    segmentId: source.id,
    quote: item.quote,
    start,
    end: start + item.quote.length,
  };
}
const insignificant = new Set(
  'a an and or the to of in with for is are be have has must required preferred experience knowledge skills ability good strong excellent using use work working'.split(
    ' ',
  ),
);
export function validateMatchResult(
  value: unknown,
  sources: MatchingSources,
): MatchResult {
  const row = record(value, ['requirements']);
  if (!Array.isArray(row.requirements) || row.requirements.length > 12)
    throw new MatchingValidationError(
      'The AI response contains too many requirements. No report was accepted.',
    );
  const seen = new Set<string>();
  const requirements = row.requirements.map((value) => {
    const item = record(value, ['job', 'classification', 'evidence']);
    const job = citation(item.job, sources.job),
      source = sources.job.find((s) => s.id === job.segmentId)!;
    if (seen.has(job.segmentId + ':' + job.quote))
      throw new MatchingValidationError(
        'The AI repeated a requirement. No report was accepted.',
      );
    seen.add(job.segmentId + ':' + job.quote);
    if (
      !MATCH_CLASSES.includes(item.classification as MatchClass) ||
      !Array.isArray(item.evidence) ||
      item.evidence.length > 3
    )
      throw new MatchingValidationError(
        'The AI supplied an invalid classification. No report was accepted.',
      );
    const classification = item.classification as MatchClass,
      evidence = item.evidence.map((v) => citation(v, sources.resume));
    if (
      (classification === 'demonstrated' || classification === 'partial') &&
      !evidence.length
    )
      throw new MatchingValidationError(
        'A matching qualification needs resume evidence. No report was accepted.',
      );
    if (classification === 'undocumented' && evidence.length)
      throw new MatchingValidationError(
        'An undocumented classification cannot also claim supporting evidence.',
      );
    if (classification === 'demonstrated' || classification === 'partial') {
      const words =
        job.quote
          .toLowerCase()
          .match(/[\p{L}\p{N}+#.]+/gu)
          ?.map((token) => token.replace(/\.+$/, ''))
          ?.filter((w) => w.length > 1 && !insignificant.has(w)) ?? [];
      const quotes = evidence.map((e) => e.quote.toLowerCase()).join(' ');
      const tokens = (quotes.match(/[\p{L}\p{N}+#.]+/gu) ?? []).map((token) =>
        token.replace(/\.+$/, ''),
      );
      if (
        !words.some((w) => tokens.includes(w)) ||
        (classification === 'demonstrated' &&
          (!words.every((w) => tokens.includes(w)) ||
            /\b(?:not|never|no|without|learning|beginner|aspiring|hope|want)\b/i.test(
              quotes,
            )))
      )
        throw new MatchingValidationError(
          'The AI claimed a qualification without sufficiently direct evidence. No report was accepted.',
        );
      for (const number of classification === 'demonstrated'
        ? (job.quote.match(/\b\d+\b/g) ?? [])
        : [])
        if (!tokens.includes(number))
          throw new MatchingValidationError(
            'The AI claimed an unsupported numeric qualification. No report was accepted.',
          );
    }
    return {
      job,
      importance: requirementImportance(job.quote, source.importance),
      classification,
      evidence,
    };
  });
  return { requirements };
}
export function matchingSuggestion(classification: MatchClass): string {
  return {
    demonstrated:
      'Keep this concrete evidence visible. Check that it supports the full requirement, including scope and experience.',
    partial:
      'If true, add the missing scope, tools, or outcomes from an actual project or experience. Otherwise describe your current learning accurately.',
    undocumented:
      'This was not documented in the reviewed text. If you have relevant experience, add a truthful example; otherwise consider a small practice project or ask whether the requirement is flexible.',
    unclear:
      'Confirm this requirement and your relevant experience before drawing a conclusion. Ask the employer what they mean if the wording is ambiguous.',
  }[classification];
}
