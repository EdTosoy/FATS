import {
  createCareerBackup,
  emptyEmployment,
  emptyEmploymentDocument,
  type CareerEmployment,
  type CareerEvent,
} from '@fats/domain';
import {
  portableOfferFixture,
  portableTimestamp,
} from './portable-offer-fixture';
export function careerFixture() {
  const base = portableOfferFixture();
  const details = {
    ...emptyEmployment(),
    employer: 'Synthetic Career Employer',
    title: 'Graduate Assistant',
    status: 'Current' as const,
    startOn: '2026-09-01',
    applicationId: base.data.applications[0].id,
    fromAcceptedOffer: true,
  };
  const document = {
    ...emptyEmploymentDocument(),
    category: 'Certificate of Employment (COE)' as const,
    status: 'Requested' as const,
    requestedOn: '2026-10-15',
    followUpOn: '2026-10-20',
    notes: 'A synthetic request, not sent by FATS.',
  };
  const events: CareerEvent[] = [
    {
      kind: 'employment',
      documentId: null,
      details,
      requestId: '40000000-0000-4000-8000-000000000001',
      sequence: 1,
      recordedAt: portableTimestamp,
      documentReference: null,
    },
    {
      kind: 'document',
      documentId: '50000000-0000-4000-8000-000000000001',
      details: document,
      requestId: '40000000-0000-4000-8000-000000000002',
      sequence: 2,
      recordedAt: portableTimestamp,
      documentReference: null,
    },
    {
      kind: 'document',
      documentId: '50000000-0000-4000-8000-000000000001',
      details: {
        ...document,
        status: 'Received',
        issuedOn: '2026-10-16',
        followUpOn: '',
        notes: 'Synthetic paper copy received.',
      },
      requestId: '40000000-0000-4000-8000-000000000003',
      sequence: 3,
      recordedAt: portableTimestamp,
      documentReference: '60000000-0000-4000-8000-000000000001',
    },
  ];
  const employment: CareerEmployment = {
    id: '30000000-0000-4000-8000-000000000001',
    version: events.length,
    createdAt: portableTimestamp,
    updatedAt: portableTimestamp,
    details,
    events,
  };
  return createCareerBackup(
    { ...base.data, employments: [employment] },
    portableTimestamp,
  );
}
