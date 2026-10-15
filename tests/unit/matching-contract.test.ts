import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { validateMatchResult, type MatchingSources } from '@fats/domain';
import {
  MATCHING_SCHEMA,
  MATCHING_INSTRUCTIONS,
  MATCHING_CONTRACT_VERSION,
  OpenAiMatchingProvider,
} from '../../apps/web/src/server/matching-provider';
// Use the already installed ESLint validator to exercise the actual schema;
// no additional runtime or test dependency is introduced.
const require = createRequire(import.meta.url);
const Ajv = createRequire(require.resolve('eslint/package.json'))(
  'ajv',
) as new () => {
  compile(schema: unknown): (value: unknown) => boolean;
};
const schemaAccepts = new Ajv().compile(MATCHING_SCHEMA);
const sources: MatchingSources = {
  resume: [
    {
      id: 'R001',
      text: 'Built Python projects for a university capstone.',
      location: 'Paragraph 1',
      importance: 'unclear',
    },
    {
      id: 'R002',
      text: 'No React project or professional Python employment is documented.',
      location: 'Paragraph 2',
      importance: 'unclear',
    },
    {
      id: 'R003',
      text: 'Used Excel pivot tables in a school survey.',
      location: 'Paragraph 3',
      importance: 'unclear',
    },
  ],
  job: [
    {
      id: 'J001',
      text: 'Python projects required.',
      location: 'Job line 1',
      importance: 'mandatory',
    },
    {
      id: 'J002',
      text: 'React experience preferred.',
      location: 'Job line 2',
      importance: 'preferred',
    },
    {
      id: 'J003',
      text: 'Professional Python employment required.',
      location: 'Job line 3',
      importance: 'mandatory',
    },
  ],
  warnings: [],
};
const row = () => ({
  job: { segmentId: 'J001', quote: sources.job[0].text },
  classification: 'demonstrated',
  evidence: [{ segmentId: 'R001', quote: sources.resume[0].text }],
});
const wrap = (value: unknown) => ({ requirements: [value] });
it('encodes evidence cardinality per classification and preserves authoritative rejection of the baseline conflict', () => {
  expect(schemaAccepts(wrap(row()))).toBe(true);
  const absent = {
    job: { segmentId: 'J002', quote: sources.job[1].text },
    classification: 'undocumented',
    evidence: [],
  };
  expect(schemaAccepts(wrap(absent))).toBe(true);
  expect(
    validateMatchResult(wrap(absent), sources).requirements[0].classification,
  ).toBe('undocumented');
  const conflict = {
    ...absent,
    evidence: [
      {
        segmentId: 'R002',
        quote:
          'No React project or professional Python employment is documented.',
      },
    ],
  };
  const before = structuredClone(conflict);
  expect(schemaAccepts(wrap(conflict))).toBe(false);
  expect(() => validateMatchResult(wrap(conflict), sources)).toThrow(
    'undocumented',
  );
  expect(conflict).toEqual(before); // No relabeling or evidence stripping.
  for (const classification of ['demonstrated', 'partial']) {
    expect(
      schemaAccepts(wrap({ ...row(), classification, evidence: [] })),
    ).toBe(false);
    expect(() =>
      validateMatchResult(
        wrap({ ...row(), classification, evidence: [] }),
        sources,
      ),
    ).toThrow();
    expect(schemaAccepts(wrap({ ...row(), classification }))).toBe(true);
  }
  expect(
    schemaAccepts(wrap({ ...row(), classification: 'unclear', evidence: [] })),
  ).toBe(true);
});
it('rejects irrelevant partial evidence, exact negated support and fabricated professional scope at the server boundary', () => {
  const proposals = [
    {
      ...row(),
      classification: 'partial',
      evidence: [{ segmentId: 'R003', quote: sources.resume[2].text }],
    },
    {
      ...row(),
      evidence: [{ segmentId: 'R002', quote: sources.resume[1].text }],
    },
    { ...row(), job: { segmentId: 'J003', quote: sources.job[2].text } },
  ];
  for (const proposal of proposals) {
    expect(schemaAccepts(wrap(proposal))).toBe(true); // Exact structure cannot prove semantic support.
    expect(() => validateMatchResult(wrap(proposal), sources)).toThrow();
  }
});
it('rejects contradictory duplicated judgments and malformed outputs rather than repairing them', () => {
  const contradictory = {
    requirements: [
      row(),
      { ...row(), classification: 'undocumented', evidence: [] },
    ],
  };
  expect(schemaAccepts(contradictory)).toBe(true);
  expect(() => validateMatchResult(contradictory, sources)).toThrow('repeated');
  for (const malformed of [
    null,
    {},
    { requirements: 'bad' },
    wrap({ ...row(), classification: ['demonstrated', 'undocumented'] }),
    wrap({ ...row(), evidence: null }),
    wrap({ ...row(), unsupportedClaim: 'invented' }),
    { ...wrap(row()), score: 100 },
  ]) {
    expect(schemaAccepts(malformed)).toBe(false);
    expect(() => validateMatchResult(malformed, sources)).toThrow();
  }
});
it('sends the repaired schema and explicit negative-evidence boundary without changing the Luna model or effort', async () => {
  const provider = new OpenAiMatchingProvider(
    'synthetic-key',
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'gpt-6-luna',
        reasoning: { effort: 'low' },
        store: false,
        text: { format: { strict: true, schema: MATCHING_SCHEMA } },
      });
      expect(body.instructions).toBe(MATCHING_INSTRUCTIONS);
      expect(body.instructions).toContain('evidence array MUST be empty: []');
      expect(body.instructions).toContain('Never turn academic projects');
      return Response.json({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: JSON.stringify(wrap(row())) },
            ],
          },
        ],
      });
    },
    'luna-low',
  );
  expect(provider.configuration.version).toBe(
    MATCHING_CONTRACT_VERSION + '-luna-low',
  );
  expect(await provider.analyze(sources, new AbortController().signal)).toEqual(
    wrap(row()),
  );
});
