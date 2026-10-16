import { describe, it, expect } from 'vitest';
import {
  validateOfferTerms,
  validateOfferCommand,
  exactOfferAmount,
  offerDeadline,
  offerToday,
  offerDate,
  latestOfferTerms,
  type Offer,
} from '@fats/domain';
export const terms = {
  receivedOn: '2026-10-16',
  salaryAmount: '',
  currency: 'PHP',
  frequency: '',
  employmentType: '',
  arrangement: '',
  location: '',
  benefits: '',
  startOn: '',
  deadlineOn: '',
  timeZone: 'Asia/Manila',
  notes: '',
  documentVersionId: '',
};
describe('Offer Desk domain', () => {
  it('requires only a received date and permits unknown terms', () => {
    expect(validateOfferTerms(terms)).toEqual(terms);
    expect(() => validateOfferTerms({ ...terms, receivedOn: '' })).toThrow(
      'date received',
    );
    for (const date of ['2026-02-29', '2026-99-99', 'not a date'])
      expect(() => offerDate(date, 'date')).toThrow('valid date');
    expect(offerDate('2028-02-29', 'date')).toBe('2028-02-29');
  });
  it('keeps precise decimal amounts as strings without rounding or numeric coercion', () => {
    for (const [value, expected] of [
      ['35000.00', '35000'],
      ['0.0100', '0.01'],
      ['99999999999999.9999', '99999999999999.9999'],
      ['0', '0'],
      ['', ''],
    ])
      expect(exactOfferAmount(value)).toBe(expected);
    for (const value of [
      35000,
      -1,
      '-1',
      '35,000',
      '1e4',
      '01',
      '0.00001',
      '100000000000000',
    ])
      expect(() => exactOfferAmount(value)).toThrow();
  });
  it('validates all optional fields and confirmed actions', () => {
    for (const patch of [
      { currency: 'PH' },
      { timeZone: 'unknown' },
      { frequency: 'invented' },
      { arrangement: 'sometimes' },
      { notes: 'a'.repeat(5001) },
      { documentVersionId: '../secret' },
    ])
      expect(() => validateOfferTerms({ ...terms, ...patch })).toThrow();
    expect(() =>
      validateOfferCommand({
        kind: 'decision',
        occurredOn: '2026-10-16',
        notes: '',
        decision: 'accepted',
        confirmed: false,
      }),
    ).toThrow('Confirm');
    expect(() =>
      validateOfferCommand({
        kind: 'review',
        occurredOn: '2026-10-16',
        checklist: [],
        questions: '',
      }),
    ).toThrow('review state');
    expect(() =>
      validateOfferCommand({
        kind: 'negotiation',
        occurredOn: '2026-10-16',
        notes: '',
      }),
    ).toThrow('brief');
  });
  it('uses the offer timezone and whole calendar days, never inferring withdrawal', () => {
    const now = new Date('2026-10-16T16:00:00Z');
    expect(offerToday('Asia/Manila', now)).toBe('2026-10-17');
    expect(
      offerDeadline(
        validateOfferTerms({ ...terms, deadlineOn: '2026-10-16' }),
        now,
      ),
    ).toMatchObject({ tone: 'passed', days: -1 });
    expect(
      offerDeadline(
        validateOfferTerms({ ...terms, deadlineOn: '2026-10-17' }),
        now,
      ),
    ).toMatchObject({ tone: 'soon', days: 0 });
    expect(
      offerDeadline(
        validateOfferTerms({ ...terms, deadlineOn: '2026-10-20' }),
        now,
      ),
    ).toMatchObject({ tone: 'soon', days: 3 });
    expect(
      offerDeadline(
        validateOfferTerms({ ...terms, deadlineOn: '2026-10-21' }),
        now,
      ),
    ).toMatchObject({ tone: 'upcoming', days: 4 });
    expect(offerDeadline(validateOfferTerms(terms), now)).toBeNull();
    expect(
      offerToday('America/New_York', new Date('2026-11-01T05:30:00Z')),
    ).toBe('2026-11-01');
  });
  it('selects the latest recorded terms without overwriting earlier revisions', () => {
    const first = validateOfferTerms({ ...terms, salaryAmount: '35000' }),
      second = validateOfferTerms({ ...terms, salaryAmount: '38000' });
    const offer = {
      events: [
        { terms: first },
        { terms: null },
        { terms: second },
        { terms: null },
      ],
    } as Offer;
    expect(latestOfferTerms(offer)).toEqual(second);
    expect(offer.events[0].terms?.salaryAmount).toBe('35000');
  });
});
