import { describe, expect, it } from 'vitest';
import {
  PREPARATION_KINDS,
  changeApplicationPreparation,
  createApplication,
  validatePreparations,
  createBackup,
  createPortableBackup,
  createCareerBackup,
  serializeBackup,
  parseBackup,
  workspaceCounts,
  type PreparationInput,
} from '@fats/domain';
const now = '2026-11-06T00:00:00.000Z',
  later = '2026-11-07T00:00:00.000Z';
const input: PreparationInput = {
  kind: 'cover-letter',
  title: 'Cover letter',
  text: 'Dear hiring team,\nMy draft.',
  url: '',
  state: 'draft',
};
const application = () =>
  createApplication(
    {
      title: 'Engineer',
      company: 'Example',
      sourceUrl: 'https://example.test/job',
      location: 'Cebu',
      description: 'Original description',
      notes: 'General notes',
    },
    'application',
    now,
  );
const save = (app = application(), value = input, id = 'cover') =>
  changeApplicationPreparation(
    app,
    { action: 'save', id, input: value, expected: null },
    now,
  );
describe('preparation materials', () => {
  it.each(Object.keys(PREPARATION_KINDS) as PreparationInput['kind'][])(
    'creates and revises %s without touching application tracking',
    (kind) => {
      const original = application();
      const saved = save(original, { ...input, kind });
      expect(saved.preparations?.[0]).toMatchObject({
        id: 'cover',
        kind,
        state: 'draft',
        text: input.text,
      });
      expect(saved.status).toBe(original.status);
      expect(saved.activities).toBeUndefined();
      expect(saved.description).toBe(original.description);
      expect(original.preparations).toBeUndefined();
      const revised = changeApplicationPreparation(
        saved,
        {
          action: 'save',
          id: 'cover',
          input: { ...input, kind, text: 'Revised', state: 'ready' },
          expected: saved.preparations![0],
        },
        later,
      );
      expect(revised.preparations?.[0]).toMatchObject({
        state: 'ready',
        text: 'Revised',
        createdAt: now,
        updatedAt: later,
      });
    },
  );
  it('records the actual submitted content, preserves it across edits, and replaces it only explicitly', () => {
    const saved = save();
    const submitted = changeApplicationPreparation(
      saved,
      { action: 'submit', id: 'cover', expected: saved.preparations![0] },
      now,
    );
    expect(submitted.preparations![0].submitted).toMatchObject({
      text: input.text,
      submittedAt: now,
    });
    const revised = changeApplicationPreparation(
      submitted,
      {
        action: 'save',
        id: 'cover',
        input: { ...input, text: 'Next draft' },
        expected: submitted.preparations![0],
      },
      later,
    );
    expect(revised.preparations![0].state).toBe('draft');
    expect(revised.preparations![0].submitted?.text).toBe(input.text);
    const recorded = changeApplicationPreparation(
      revised,
      { action: 'submit', id: 'cover', expected: revised.preparations![0] },
      later,
    );
    expect(recorded.preparations![0].submitted?.text).toBe('Next draft');
  });
  it('supports multiple screening answers, safe portfolio URLs and reuse of application Notes', () => {
    const first = save(application(), {
      ...input,
      kind: 'screening-answer',
      title: 'Why this role?',
    });
    const second = save(
      first,
      { ...input, kind: 'screening-answer', title: 'When can you start?' },
      'answer-2',
    );
    const third = save(
      second,
      { ...input, kind: 'portfolio', url: 'https://example.test/project' },
      'project',
    );
    const notes = changeApplicationPreparation(
      third,
      { action: 'notes', text: 'Preparation notes', expected: 'General notes' },
      later,
    );
    expect(notes.preparations).toHaveLength(3);
    expect(notes.notes).toBe('Preparation notes');
    expect(() =>
      changeApplicationPreparation(
        notes,
        { action: 'notes', text: 'Stale', expected: 'General notes' },
        later,
      ),
    ).toThrow('changed');
  });
  it('rejects stale edits and deletes, including when timestamps coincide; independent entries can save', () => {
    const saved = save();
    const existing = saved.preparations![0];
    const changed = changeApplicationPreparation(
      saved,
      {
        action: 'save',
        id: 'cover',
        input: { ...input, text: 'Concurrent edit' },
        expected: existing,
      },
      now,
    );
    for (const action of ['submit', 'delete'] as const)
      expect(() =>
        changeApplicationPreparation(
          changed,
          { action, id: 'cover', expected: existing },
          now,
        ),
      ).toThrow('changed');
    expect(() =>
      changeApplicationPreparation(
        changed,
        { action: 'save', id: 'cover', input, expected: existing },
        now,
      ),
    ).toThrow('changed');
    expect(() => save(changed)).toThrow('changed');
    const added = save(changed, input, 'independent');
    expect(added.preparations).toHaveLength(2);
  });
  it('deletes the selected draft and submitted copy without changing other entries', () => {
    const base = save(save(), input, 'other');
    const saved = changeApplicationPreparation(
      base,
      { action: 'submit', id: 'cover', expected: base.preparations![0] },
      now,
    );
    const deleted = changeApplicationPreparation(
      saved,
      { action: 'delete', id: 'cover', expected: saved.preparations![0] },
      later,
    );
    expect(deleted.preparations?.map((row) => row.id)).toEqual(['other']);
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'https://user:secret@example.test/project',
    'invalid',
  ])('rejects unsafe portfolio URL %s', (url) =>
    expect(() =>
      save(application(), { ...input, kind: 'portfolio', url }),
    ).toThrow(),
  );
  it.each([
    { title: '' },
    { text: 'x'.repeat(20001) },
    { title: 'x'.repeat(301) },
    { state: 'submitted' },
    { kind: 'constructor' },
    { url: 'https://example.test/not-portfolio' },
  ])('rejects malformed material %j', (patch) =>
    expect(() =>
      save(application(), { ...input, ...patch } as PreparationInput),
    ).toThrow(),
  );
  it('allows empty text only while drafting, never when ready/submitted', () => {
    const blank = save(application(), { ...input, text: '' });
    expect(blank.preparations![0].text).toBe('');
    expect(() =>
      save(application(), { ...input, text: ' ', state: 'ready' }),
    ).toThrow('Add text');
    expect(() =>
      changeApplicationPreparation(
        blank,
        { action: 'submit', id: 'cover', expected: blank.preparations![0] },
        now,
      ),
    ).toThrow('Add text');
  });
  it('preserves draft whitespace and line breaks exactly through backup validation', () => {
    const text = '  Dear team,\n\n  Thank you.  ';
    const saved = save(application(), { ...input, text });
    expect(
      parseBackup(
        serializeBackup(
          createBackup({ applications: [saved], interviews: [] }, now),
        ),
      ).data.applications[0].preparations![0].text,
    ).toBe(text);
  });
  it('validates backup bounds, unique IDs and submitted-copy integrity', () => {
    const saved = save().preparations![0];
    for (const values of [
      null,
      [saved, saved],
      Array.from({ length: 101 }, () => saved),
      [{ ...saved, state: 'submitted' }],
      [{ ...saved, createdAt: 'bad' }],
      [
        {
          ...saved,
          state: 'submitted',
          submitted: { ...input, text: 'Different', submittedAt: now },
        },
      ],
    ])
      expect(() => validatePreparations(values)).toThrow();
  });
  it('round trips old records and preparation/submitted copies through all existing JSON backup versions', () => {
    const base = save();
    const submitted = changeApplicationPreparation(
      base,
      { action: 'submit', id: 'cover', expected: base.preparations![0] },
      now,
    );
    const legacy = application();
    legacy.id = 'legacy';
    const data = { applications: [legacy, submitted], interviews: [] };
    for (const backup of [
      createBackup(data, now),
      createPortableBackup({ ...data, offers: [] }, now),
      createCareerBackup({ ...data, offers: [], employments: [] }, now),
    ])
      expect(parseBackup(serializeBackup(backup)).data.applications).toEqual(
        data.applications,
      );
    expect(workspaceCounts(data)).toMatchObject({ preparations: 1 });
    expect(
      createBackup({ applications: [legacy], interviews: [] }, now).data
        .applications[0].preparations,
    ).toBeUndefined();
    const invalid = JSON.parse(serializeBackup(createBackup(data, now)));
    invalid.data.applications[1].preparations[0].kind = 'future-kind';
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow();
  });
});
