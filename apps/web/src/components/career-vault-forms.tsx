'use client';
import {
  cloneElement,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type ReactElement,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  EMPLOYMENT_STATES,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_DOCUMENT_CATEGORIES,
  EMPLOYMENT_DOCUMENT_STATES,
  WORK_ARRANGEMENTS,
  emptyEmployment,
  emptyEmploymentDocument,
  normalizeEmployment,
  normalizeEmploymentDocument,
  type EmploymentInput,
  type EmploymentDocumentInput,
  type CareerChange,
  type CareerEmployment,
  type JobApplication,
  type Offer,
  type DocumentLibrary,
} from '@fats/domain';
import { Button } from './ui';

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="career-field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
type Save = (
  employmentId: string,
  baseVersion: number,
  requestId: string,
  change: CareerChange,
) => Promise<void>;
function useCareerSave(
  save: Save,
  employmentId: string,
  baseVersion: number,
  done: () => void,
) {
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(change: CareerChange) {
    setBusy(true);
    setError('');
    try {
      const signature = JSON.stringify(change);
      if (pending.current?.signature !== signature)
        pending.current = { signature, id: crypto.randomUUID() };
      await save(employmentId, baseVersion, pending.current.id, change);
      done();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'This record could not be saved. Keep your inputs and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, submit };
}
function CareerDialog({
  title,
  description,
  busy,
  onClose,
  children,
  opener,
}: {
  title: string;
  description: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  opener: HTMLElement | null;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content career-dialog"
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener?.isConnected) opener.focus();
            else document.getElementById('page-title')?.focus();
          }}
        >
          <div className="dialog-heading">
            <Dialog.Title className="dialog-title">{title}</Dialog.Title>
            <Dialog.Close
              className="icon-button"
              disabled={busy}
              aria-label="Close Career Vault form"
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="muted">
            {description}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function EmploymentForm({
  record,
  id,
  applications,
  offers,
  save,
  onClose,
  opener,
}: {
  record: CareerEmployment | null;
  id: string;
  applications: JobApplication[];
  offers: Offer[];
  save: Save;
  onClose: () => void;
  opener: HTMLElement | null;
}) {
  const [input, setInput] = useState<EmploymentInput>(
      () => record?.details ?? emptyEmployment(),
    ),
    [prefill, setPrefill] = useState('');
  const state = useCareerSave(save, id, record?.version ?? 0, onClose);
  const accepted = offers.filter(
    (offer) =>
      offer.state === 'accepted' &&
      applications.some((app) => app.id === offer.applicationId),
  );
  const change = <K extends keyof EmploymentInput>(
    key: K,
    value: EmploymentInput[K],
  ) => setInput((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await state.submit({
        kind: 'employment',
        documentId: null,
        details: normalizeEmployment(input),
      });
    } catch (error) {
      state.setError(
        error instanceof Error
          ? error.message
          : 'Check your employment details.',
      );
    }
  }
  return (
    <CareerDialog
      title={record ? 'Edit employment' : 'Add employment'}
      description="Your personal record of a job. This does not verify employment with the employer or update your application or offer."
      busy={state.busy}
      onClose={onClose}
      opener={opener}
    >
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={state.busy}>
          {!record && accepted.length > 0 && (
            <details className="career-prefill">
              <summary>Start with an accepted offer (optional)</summary>
              <Field label="Accepted offer">
                <select
                  aria-label="Accepted offer"
                  value={prefill}
                  onChange={(event) => setPrefill(event.target.value)}
                >
                  <option value="">Choose an accepted offer</option>
                  {accepted.map((offer) => {
                    const app = applications.find(
                      (app) => app.id === offer.applicationId,
                    )!;
                    return (
                      <option
                        value={offer.applicationId}
                        key={offer.applicationId}
                      >
                        {app.title} · {app.company}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Button
                type="button"
                variant="secondary"
                disabled={!prefill}
                onClick={() => {
                  const app = applications.find((app) => app.id === prefill)!,
                    offer = accepted.find(
                      (offer) => offer.applicationId === prefill,
                    )!,
                    terms = [...offer.events]
                      .reverse()
                      .find((event) => event.kind === 'terms')?.terms;
                  setInput((current) => ({
                    ...current,
                    employer: app.company,
                    title: app.title,
                    location: terms?.location || app.location,
                    arrangement: terms?.arrangement ?? '',
                    employmentType: EMPLOYMENT_TYPES.includes(
                      terms?.employmentType as EmploymentInput['employmentType'],
                    )
                      ? (terms!
                          .employmentType as EmploymentInput['employmentType'])
                      : 'Other',
                    status: 'Not started',
                    startOn: terms?.startOn ?? '',
                    endOn: '',
                    applicationId: app.id,
                    fromAcceptedOffer: true,
                  }));
                }}
              >
                Use offer details
              </Button>
              <p className="field-hint">
                This copies available details and a proposed start date. It
                keeps the status Not started; confirm your actual dates before
                marking this job Current.
              </p>
            </details>
          )}
          <Field label="Employer name">
            <input
              required
              maxLength={200}
              value={input.employer}
              onChange={(event) => change('employer', event.target.value)}
            />
          </Field>
          <Field label="Job title">
            <input
              required
              maxLength={200}
              value={input.title}
              onChange={(event) => change('title', event.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="Employment type">
              <select
                aria-label="Employment type"
                value={input.employmentType}
                onChange={(event) =>
                  change(
                    'employmentType',
                    event.target.value as EmploymentInput['employmentType'],
                  )
                }
              >
                {EMPLOYMENT_TYPES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Employment status">
              <select
                aria-label="Employment status"
                value={input.status}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    status: event.target.value as EmploymentInput['status'],
                    endOn:
                      event.target.value === 'Previous' ? current.endOn : '',
                  }))
                }
              >
                {EMPLOYMENT_STATES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-grid">
            <Field
              label={
                input.status === 'Not started'
                  ? 'Proposed start date (optional)'
                  : 'Start date'
              }
            >
              <input
                type="date"
                required={input.status !== 'Not started'}
                value={input.startOn}
                onChange={(event) => change('startOn', event.target.value)}
              />
            </Field>
            {input.status === 'Previous' && (
              <Field label="End date">
                <input
                  type="date"
                  required
                  min={input.startOn || undefined}
                  value={input.endOn}
                  onChange={(event) => change('endOn', event.target.value)}
                />
              </Field>
            )}
          </div>
          <details
            open={Boolean(input.location || input.arrangement || input.notes)}
          >
            <summary>Location and notes (optional)</summary>
            <Field label="Work location">
              <input
                maxLength={200}
                value={input.location}
                onChange={(event) => change('location', event.target.value)}
              />
            </Field>
            <Field label="Work arrangement">
              <select
                aria-label="Work arrangement"
                value={input.arrangement}
                onChange={(event) =>
                  change(
                    'arrangement',
                    event.target.value as EmploymentInput['arrangement'],
                  )
                }
              >
                {WORK_ARRANGEMENTS.map((value) => (
                  <option value={value} key={value}>
                    {value || 'Not recorded'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Employment notes">
              <textarea
                rows={3}
                maxLength={2000}
                value={input.notes}
                onChange={(event) => change('notes', event.target.value)}
              />
            </Field>
          </details>
          <details open={Boolean(input.applicationId)}>
            <summary>Application connection (optional)</summary>
            <Field label="Linked application">
              <select
                aria-label="Linked application"
                value={input.applicationId}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    applicationId: event.target.value,
                    fromAcceptedOffer: false,
                  }))
                }
              >
                <option value="">No application connection</option>
                {applications.map((app) => (
                  <option value={app.id} key={app.id}>
                    {app.title} · {app.company}
                  </option>
                ))}
              </select>
            </Field>
            {input.fromAcceptedOffer && (
              <p className="field-hint">
                Connected to an offer recorded as accepted when linked.
                Employment status stays separate.
              </p>
            )}
          </details>
          {record && (
            <label className="career-checkbox">
              <input
                type="checkbox"
                checked={input.archived}
                onChange={(event) => change('archived', event.target.checked)}
              />
              Archive this employment, keeping its history
            </label>
          )}
          {state.error && (
            <p role="alert" className="error-message">
              {state.error}
            </p>
          )}
          <div className="form-footer">
            <span className="field-hint">
              {record
                ? 'Changes keep earlier history.'
                : 'No documents are added automatically.'}
            </span>
            <div>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                {state.busy ? 'Saving…' : 'Save employment'}
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
    </CareerDialog>
  );
}
export function EmploymentDocumentForm({
  record,
  entry,
  documentId,
  library,
  save,
  onClose,
  opener,
}: {
  record: CareerEmployment;
  entry: EmploymentDocumentInput | null;
  documentId: string;
  library: DocumentLibrary | null;
  save: Save;
  onClose: () => void;
  opener: HTMLElement | null;
}) {
  const [input, setInput] = useState<EmploymentDocumentInput>(
    () => entry ?? emptyEmploymentDocument(),
  );
  const state = useCareerSave(save, record.id, record.version, onClose);
  const available =
    library?.documents
      .filter((document) => !document.archived)
      .flatMap((document) =>
        document.versions
          .filter((version) => version.health === 'available')
          .map((version) => ({
            id: version.id,
            label: `${document.name} · version ${version.number} · ${version.originalFilename}`,
          })),
      ) ?? [];
  const change = <K extends keyof EmploymentDocumentInput>(
    key: K,
    value: EmploymentDocumentInput[K],
  ) => setInput((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await state.submit({
        kind: 'document',
        documentId,
        details: normalizeEmploymentDocument(input),
      });
    } catch (error) {
      state.setError(
        error instanceof Error ? error.message : 'Check the document entry.',
      );
    }
  }
  return (
    <CareerDialog
      title={entry ? 'Edit document entry' : 'Add document entry'}
      description="Track a record even if you keep it on paper or elsewhere. Received does not mean a file is stored in FATS. Add only the records that matter to you."
      busy={state.busy}
      onClose={onClose}
      opener={opener}
    >
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={state.busy}>
          <Field label="Document category">
            <select
              aria-label="Document category"
              value={input.category}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,
                  category: event.target
                    .value as EmploymentDocumentInput['category'],
                  taxYear: ['BIR Form 2316', 'Payslip'].includes(
                    event.target.value,
                  )
                    ? current.taxYear
                    : '',
                }))
              }
            >
              {EMPLOYMENT_DOCUMENT_CATEGORIES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Label (optional)">
            <input
              maxLength={200}
              value={input.name}
              onChange={(event) => change('name', event.target.value)}
              placeholder="e.g. March payslip"
            />
          </Field>
          <Field label="Tracking status">
            <select
              aria-label="Tracking status"
              value={input.status}
              onChange={(event) =>
                change(
                  'status',
                  event.target.value as EmploymentDocumentInput['status'],
                )
              }
            >
              {EMPLOYMENT_DOCUMENT_STATES.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <details
            open={Boolean(
              input.issuedOn ||
              input.taxYear ||
              input.requestedOn ||
              input.followUpOn ||
              input.notes,
            )}
          >
            <summary>Dates and notes (optional)</summary>
            <div className="form-grid">
              <Field label="Requested on">
                <input
                  type="date"
                  value={input.requestedOn}
                  onChange={(event) =>
                    change('requestedOn', event.target.value)
                  }
                />
              </Field>
              <Field label="Issue date">
                <input
                  type="date"
                  value={input.issuedOn}
                  onChange={(event) => change('issuedOn', event.target.value)}
                />
              </Field>
            </div>
            {['BIR Form 2316', 'Payslip'].includes(input.category) && (
              <Field label="Tax year (optional)">
                <input
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={input.taxYear}
                  onChange={(event) => change('taxYear', event.target.value)}
                />
              </Field>
            )}
            <Field label="Follow-up date">
              <input
                type="date"
                value={input.followUpOn}
                onChange={(event) => change('followUpOn', event.target.value)}
              />
            </Field>
            <p className="field-hint">
              A date for your reference. FATS does not send reminders or contact
              your employer.
            </p>
            <Field label="Document notes">
              <textarea
                rows={3}
                maxLength={2000}
                value={input.notes}
                onChange={(event) => change('notes', event.target.value)}
              />
            </Field>
          </details>
          <details open={Boolean(input.documentVersionId)}>
            <summary>Existing file (optional)</summary>
            <p className="field-hint">
              Saving new files is temporarily unavailable while required safety
              scanning is not operational. Metadata works without a file. Only
              available, authorized accepted versions can be linked.
            </p>
            <Field label="Available file">
              <select
                aria-label="Available file"
                value={input.documentVersionId}
                onChange={(event) =>
                  change('documentVersionId', event.target.value)
                }
              >
                <option value="">No file — track metadata only</option>
                {available.map((version) => (
                  <option value={version.id} key={version.id}>
                    {version.label}
                  </option>
                ))}
                {input.documentVersionId &&
                  !available.some(
                    (version) => version.id === input.documentVersionId,
                  ) && (
                    <option value={input.documentVersionId}>
                      Previously linked version — availability will be checked
                    </option>
                  )}
              </select>
            </Field>
            <p className="field-hint">
              A missing or unverified file stays blocked. Choose No file to save
              metadata; earlier links remain in history.
            </p>
          </details>
          {state.error && (
            <p role="alert" className="error-message">
              {state.error}
            </p>
          )}
          <div className="form-footer">
            <span className="field-hint">Earlier entries stay in history.</span>
            <div>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">
                {state.busy ? 'Saving…' : 'Save document entry'}
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
    </CareerDialog>
  );
}
