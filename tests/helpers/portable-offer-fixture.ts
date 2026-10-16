import {
  createApplication,
  createInterview,
  createPortableBackup,
  OFFER_CHECKLIST,
  type PortableOffer,
  type OfferTerms,
} from '@fats/domain';
export const portableTimestamp = '2026-10-16T08:00:00.000Z';
export function portableOfferFixture() {
  const application = createApplication(
    {
      title: 'Graduate Analyst',
      company: 'Synthetic Offer Employer',
      sourceUrl: 'https://example.test/offer',
      location: 'Makati',
      description: '',
    },
    'portable-application',
    portableTimestamp,
  );
  const terms: OfferTerms = {
    receivedOn: '2026-10-16',
    salaryAmount: '35000.0001',
    currency: 'PHP',
    frequency: 'monthly',
    employmentType: '',
    arrangement: 'hybrid',
    location: 'Makati',
    benefits: '',
    startOn: '',
    deadlineOn: '2026-10-20',
    timeZone: 'Asia/Manila',
    notes: '',
    documentVersionId: '',
  };
  const base = {
    occurredOn: '2026-10-16',
    recordedAt: portableTimestamp,
    notes: '',
    terms: null,
    decision: null,
    review: null,
    documentReference: null,
  };
  const checklist = OFFER_CHECKLIST.map((_, i) =>
    i === 0 ? ('Reviewed' as const) : ('Need to clarify' as const),
  );
  const offer: PortableOffer = {
    applicationId: application.id,
    version: 5,
    state: 'accepted',
    checklist,
    questions: 'When does the day start?',
    events: [
      {
        ...base,
        requestId: '10000000-0000-4000-8000-000000000001',
        sequence: 1,
        kind: 'terms',
        terms,
        documentReference: '20000000-0000-4000-8000-000000000001',
      },
      {
        ...base,
        requestId: '10000000-0000-4000-8000-000000000002',
        sequence: 2,
        kind: 'negotiation',
        notes: 'Requested PHP 40000 monthly.',
        occurredOn: '2026-10-18',
      },
      {
        ...base,
        requestId: '10000000-0000-4000-8000-000000000003',
        sequence: 3,
        kind: 'terms',
        terms: { ...terms, salaryAmount: '38000' },
        occurredOn: '2026-10-20',
      },
      {
        ...base,
        requestId: '10000000-0000-4000-8000-000000000004',
        sequence: 4,
        kind: 'review',
        review: { checklist, questions: 'When does the day start?' },
      },
      {
        ...base,
        requestId: '10000000-0000-4000-8000-000000000005',
        sequence: 5,
        kind: 'decision',
        decision: 'accepted',
        notes: 'Told HR by email.',
        occurredOn: '2026-10-21',
      },
    ],
  };
  return createPortableBackup(
    {
      applications: [application],
      interviews: [
        createInterview(
          {
            applicationId: application.id,
            title: 'Final conversation',
            stage: 'Final',
            scheduledAt: '2030-10-16T02:00:00.000Z',
            timeZone: 'Asia/Manila',
            meetingUrl: 'https://example.test/interview',
            location: '',
            preparationNotes: 'Ask about the role',
            reflections: '',
          },
          'portable-interview',
          portableTimestamp,
        ),
      ],
      offers: [offer],
    },
    portableTimestamp,
  );
}
