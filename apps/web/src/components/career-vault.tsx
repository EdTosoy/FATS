'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Plus, Search } from 'lucide-react';
import {
  EMPLOYMENT_STATES,
  employmentDocuments,
  type CareerEmployment,
  type CareerChange,
  type CareerEvent,
  type EmploymentDocumentInput,
} from '@fats/domain';
import { useAccount } from './account-provider';
import { useApplications } from './application-provider';
import { useOffers } from './offer-provider';
import { useDocuments, documentUrl } from './document-provider';
import {
  ACCOUNT_CHANGED_EVENT,
  SESSION_EXPIRED_EVENT,
} from '@/lib/http-workspace-repository';
import { PageHeading, Card, Button, ActionLink, EmptyState } from './ui';
import { EmploymentForm, EmploymentDocumentForm } from './career-vault-forms';

function displayDate(value: string) {
  return value
    ? new Date(value + 'T00:00:00Z').toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : 'Not recorded';
}
function useCareerRecords() {
  const { user } = useAccount(),
    owner = user?.id;
  const [records, setRecords] = useState<CareerEmployment[]>([]),
    [loading, setLoading] = useState(Boolean(owner)),
    [error, setError] = useState('');
  const sequence = useRef(0);
  const request = useCallback(
    async (body?: unknown) => {
      const response = await fetch('/api/career-vault', {
        method: body ? 'POST' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'x-fats-account': owner ?? '',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401)
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        if (result.code === 'ACCOUNT_CHANGED')
          window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
        throw new Error(
          result.error ??
            'Career Vault is unavailable. Keep your inputs and retry.',
        );
      }
      return result;
    },
    [owner],
  );
  const refresh = useCallback(async () => {
    if (!owner) return [];
    const current = ++sequence.current;
    try {
      const rows: CareerEmployment[] = await request();
      if (sequence.current === current) {
        setRecords(rows);
        setError('');
      }
      return rows;
    } catch (error) {
      if (sequence.current === current)
        setError(
          error instanceof Error
            ? error.message
            : 'Career Vault is unavailable.',
        );
      throw error;
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }, [owner, request]);
  useEffect(() => {
    const reload = () => void refresh().catch(() => {}),
      initial = setTimeout(reload, 0);
    window.addEventListener('focus', reload);
    return () => {
      clearTimeout(initial);
      sequence.current = -1;
      window.removeEventListener('focus', reload);
    };
  }, [refresh]);
  const save = async (
    employmentId: string,
    baseVersion: number,
    requestId: string,
    change: CareerChange,
  ) => {
    await request({ employmentId, baseVersion, requestId, change });
    await refresh();
  };
  return { records, loading, error, refresh, save };
}
function CareerFile({
  event,
}: {
  event: Extract<CareerEvent, { kind: 'document' }>;
}) {
  const { library, error } = useDocuments(),
    id = event.details.documentVersionId;
  const version = library?.documents
    .flatMap((document) => document.versions)
    .find((version) => version.id === id);
  if (id && version?.health === 'available' && !error)
    return (
      <a className="text-link" href={documentUrl(id)}>
        Download linked file
        <span className="sr-only">
          {' '}
          {version.originalFilename} version {version.number}
        </span>
      </a>
    );
  return (
    <p className="field-hint">
      {id
        ? 'Linked file unavailable or awaiting safety verification. Metadata is preserved.'
        : event.documentReference
          ? 'Historical file reference from backup — no file was restored or linked.'
          : 'Tracking only — no file linked. Received may refer to a record kept on paper or elsewhere.'}
    </p>
  );
}
function RegisterHistory({ events }: { events: CareerEvent[] }) {
  return (
    <details className="career-history">
      <summary>Document history ({events.length})</summary>
      <ol>
        {events.map(
          (event) =>
            event.kind === 'document' && (
              <li key={event.requestId}>
                <strong>{event.details.status}</strong> ·{' '}
                {new Date(event.recordedAt).toLocaleString('en-PH')}
                <p>
                  {event.details.category}
                  {event.details.name ? ` · ${event.details.name}` : ''}
                </p>
                <p className="field-hint">
                  Requested {displayDate(event.details.requestedOn)} · Issued{' '}
                  {displayDate(event.details.issuedOn)}
                  {event.details.taxYear
                    ? ` · Tax year ${event.details.taxYear}`
                    : ''}{' '}
                  · Follow-up {displayDate(event.details.followUpOn)}
                </p>
                {event.details.notes && (
                  <p className="career-notes">{event.details.notes}</p>
                )}
                <CareerFile event={event} />
              </li>
            ),
        )}
      </ol>
    </details>
  );
}
export function CareerVaultView() {
  const account = useAccount(),
    { applications } = useApplications(),
    offers = useOffers(),
    documents = useDocuments(),
    vault = useCareerRecords();
  const [search, setSearch] = useState(''),
    [status, setStatus] = useState('All statuses'),
    [archive, setArchive] = useState('Active'),
    [selected, setSelected] = useState<string | null>(null),
    [notice, setNotice] = useState('');
  const [employmentForm, setEmploymentForm] = useState<{
      id: string;
      record: CareerEmployment | null;
    } | null>(null),
    [documentForm, setDocumentForm] = useState<{
      record: CareerEmployment;
      id: string;
      entry: EmploymentDocumentInput | null;
    } | null>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const record = vault.records.find((record) => record.id === selected),
    entries = record ? employmentDocuments(record) : [];
  const blocked = account.expired || vault.loading || Boolean(vault.error);
  const filtered = vault.records
    .filter(
      (record) =>
        (archive === 'All records' ||
          record.details.archived === (archive === 'Archived')) &&
        (status === 'All statuses' || record.details.status === status) &&
        `${record.details.employer} ${record.details.title} ${record.details.location}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.details.startOn.localeCompare(a.details.startOn) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const save = async (...args: Parameters<typeof vault.save>) => {
    await vault.save(...args);
    setSelected(args[0]);
    setNotice(
      args[3].kind === 'employment'
        ? 'Employment saved.'
        : 'Document entry saved.',
    );
  };
  return (
    <>
      <PageHeading
        eyebrow="Keep your next beginning in mind"
        title="Career Vault"
        description="Your jobs and important employment records, together for your next step."
        action={
          account.user ? (
            <Button
              disabled={blocked}
              onClick={(event) => {
                setOpener(event.currentTarget);
                setEmploymentForm({ id: crypto.randomUUID(), record: null });
              }}
            >
              <Plus size={17} aria-hidden="true" />
              Add employment
            </Button>
          ) : undefined
        }
      />
      <p className="career-guidance">
        A personal organizer, not an official employment-record issuer. Add the
        records that apply to you; ask your employer which documents you need.
        FATS does not create COEs or BIR forms.
      </p>
      {!account.user ? (
        <Card>
          <EmptyState
            icon={FolderOpen}
            title="A place for your first job, whenever you’re ready."
            action={
              <ActionLink href="/sign-in?next=%2Fcareer-vault">
                Sign in to use Career Vault
              </ActionLink>
            }
          >
            <p>
              Verified accounts can keep employment history and track records
              without attaching files. No employment history is needed to get
              started.
            </p>
          </EmptyState>
        </Card>
      ) : (
        <>
          {vault.loading && (
            <p role="status">Loading your employment records…</p>
          )}
          {vault.error && (
            <Card className="content-card">
              <p role="alert" className="error-message">
                {vault.error}
              </p>
              <Button
                variant="secondary"
                onClick={() => void vault.refresh().catch(() => {})}
              >
                Reload saved records
              </Button>
            </Card>
          )}
          <p role="status">{notice}</p>
          {record ? (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                All employment records
              </Button>
              <Card className="career-job">
                <div className="career-job-heading">
                  <div>
                    <p className="eyebrow">
                      {record.details.status}
                      {record.details.archived ? ' · Archived' : ''}
                    </p>
                    <h2>{record.details.title}</h2>
                    <p className="career-employer">{record.details.employer}</p>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={blocked}
                    onClick={(event) => {
                      setOpener(event.currentTarget);
                      setEmploymentForm({ id: record.id, record });
                    }}
                  >
                    Edit employment
                  </Button>
                </div>
                <dl className="career-facts">
                  <div>
                    <dt>Employment type</dt>
                    <dd>{record.details.employmentType}</dd>
                  </div>
                  <div>
                    <dt>
                      {record.details.status === 'Not started'
                        ? 'Proposed start'
                        : 'Started'}
                    </dt>
                    <dd>{displayDate(record.details.startOn)}</dd>
                  </div>
                  {record.details.status === 'Previous' && (
                    <div>
                      <dt>Ended</dt>
                      <dd>{displayDate(record.details.endOn)}</dd>
                    </div>
                  )}
                  {record.details.location && (
                    <div>
                      <dt>Location</dt>
                      <dd>{record.details.location}</dd>
                    </div>
                  )}
                  {record.details.arrangement && (
                    <div>
                      <dt>Work arrangement</dt>
                      <dd>{record.details.arrangement}</dd>
                    </div>
                  )}
                </dl>
                {record.details.notes && (
                  <p className="career-notes">{record.details.notes}</p>
                )}
                {record.details.applicationId && (
                  <p>
                    <Link
                      className="text-link"
                      href={`/applications/${encodeURIComponent(record.details.applicationId)}`}
                    >
                      Open linked application
                    </Link>
                    {record.details.fromAcceptedOffer && (
                      <span className="field-hint">
                        {' '}
                        · Linked to accepted-offer history; employment status is
                        separate.
                      </span>
                    )}
                  </p>
                )}
                <details className="career-history">
                  <summary>
                    Employment history (
                    {
                      record.events.filter(
                        (event) => event.kind === 'employment',
                      ).length
                    }
                    )
                  </summary>
                  <ol>
                    {record.events.map(
                      (event) =>
                        event.kind === 'employment' && (
                          <li key={event.requestId}>
                            <strong>
                              {event.details.status} · {event.details.title} at{' '}
                              {event.details.employer}
                            </strong>
                            <p>
                              {displayDate(event.details.startOn)}
                              {event.details.endOn
                                ? ` — ${displayDate(event.details.endOn)}`
                                : ''}{' '}
                              · {event.details.employmentType}
                              {event.details.archived ? ' · Archived' : ''}
                            </p>
                            <p className="field-hint">
                              Recorded{' '}
                              {new Date(event.recordedAt).toLocaleString(
                                'en-PH',
                              )}
                              {event.details.location
                                ? ` · ${event.details.location}`
                                : ''}
                              {event.details.arrangement
                                ? ` · ${event.details.arrangement}`
                                : ''}
                            </p>
                            {event.details.notes && (
                              <p className="career-notes">
                                {event.details.notes}
                              </p>
                            )}
                          </li>
                        ),
                    )}
                  </ol>
                </details>
              </Card>
              <div className="career-section-heading">
                <div>
                  <h2>Your document register</h2>
                  <p className="muted">
                    {
                      entries.filter((entry) =>
                        ['Not requested', 'Requested'].includes(
                          entry.details.status,
                        ),
                      ).length
                    }{' '}
                    items not yet received. Only add what matters to you.
                  </p>
                </div>
                <Button
                  disabled={blocked}
                  onClick={(event) => {
                    setOpener(event.currentTarget);
                    setDocumentForm({
                      record,
                      id: crypto.randomUUID(),
                      entry: null,
                    });
                  }}
                >
                  Add document entry
                </Button>
              </div>
              {!entries.length ? (
                <Card>
                  <EmptyState
                    icon={FolderOpen}
                    title="Start with one record you want to keep."
                  >
                    <p>
                      A contract, a certificate, or a record to request later —
                      add an entry when it is useful. No file is required.
                    </p>
                  </EmptyState>
                </Card>
              ) : (
                <div className="career-register">
                  {entries.map((entry) => {
                    const event = entry.history.at(-1)!;
                    return (
                      <Card className="career-document" key={entry.id}>
                        <div className="career-job-heading">
                          <div>
                            <span className="career-status">
                              {entry.details.status}
                            </span>
                            <h3>
                              {entry.details.name || entry.details.category}
                            </h3>
                            {entry.details.name && (
                              <p className="field-hint">
                                {entry.details.category}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="secondary"
                            disabled={blocked}
                            onClick={(event) => {
                              setOpener(event.currentTarget);
                              setDocumentForm({
                                record,
                                id: entry.id,
                                entry: entry.details,
                              });
                            }}
                          >
                            Edit document entry
                            <span className="sr-only">
                              {' '}
                              {entry.details.name || entry.details.category}
                            </span>
                          </Button>
                        </div>
                        {entry.details.issuedOn && (
                          <p>Issued {displayDate(entry.details.issuedOn)}</p>
                        )}
                        {entry.details.taxYear && (
                          <p>Tax year {entry.details.taxYear}</p>
                        )}
                        {entry.details.requestedOn && (
                          <p>
                            Requested {displayDate(entry.details.requestedOn)}
                          </p>
                        )}
                        {entry.details.followUpOn && (
                          <p>
                            Follow-up {displayDate(entry.details.followUpOn)} ·
                            for your reference
                          </p>
                        )}
                        {entry.details.notes && (
                          <p className="career-notes">{entry.details.notes}</p>
                        )}
                        {event.kind === 'document' && (
                          <CareerFile event={event} />
                        )}
                        <RegisterHistory events={entry.history} />
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            !vault.loading &&
            !vault.error && (
              <>
                {vault.records.length > 0 && (
                  <div className="career-filters">
                    <label>
                      <Search size={16} aria-hidden="true" />
                      Search employment
                      <input
                        aria-label="Search employment"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </label>
                    <label>
                      Employment status
                      <select
                        aria-label="Filter employment status"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                      >
                        {['All statuses', ...EMPLOYMENT_STATES].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Show
                      <select
                        aria-label="Show employment records"
                        value={archive}
                        onChange={(event) => setArchive(event.target.value)}
                      >
                        {['Active', 'Archived', 'All records'].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {!filtered.length ? (
                  <Card>
                    <EmptyState
                      icon={FolderOpen}
                      title={
                        vault.records.length
                          ? 'No matching employment records.'
                          : 'Your first job is a beginning worth keeping.'
                      }
                    >
                      <p>
                        {vault.records.length
                          ? 'Try another search or filter.'
                          : 'When you start a job, add it here. You can also record a previous job or plan from an accepted offer. Your vault starts empty.'}
                      </p>
                    </EmptyState>
                  </Card>
                ) : (
                  <div className="career-jobs">
                    {filtered.map((record) => {
                      const docs = employmentDocuments(record);
                      return (
                        <Card className="career-job" key={record.id}>
                          <p className="eyebrow">
                            {record.details.status}
                            {record.details.archived ? ' · Archived' : ''}
                          </p>
                          <h2>
                            <button
                              className="career-record-link"
                              onClick={() => setSelected(record.id)}
                            >
                              {record.details.title} at{' '}
                              {record.details.employer}
                            </button>
                          </h2>
                          <p>
                            {displayDate(record.details.startOn)}
                            {record.details.endOn
                              ? ` — ${displayDate(record.details.endOn)}`
                              : ''}
                          </p>
                          <p className="field-hint">
                            {docs.length} document entries ·{' '}
                            {
                              docs.filter((entry) =>
                                ['Not requested', 'Requested'].includes(
                                  entry.details.status,
                                ),
                              ).length
                            }{' '}
                            not yet received
                          </p>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )
          )}
        </>
      )}
      <Card className="career-file-boundary">
        <div>
          <h2>Your records can start with a note.</h2>
          <p>
            Saving new document files is temporarily unavailable while required
            safety scanning is not operational. Keep metadata now; link an
            existing authorized accepted version only when available.
          </p>
          <p className="field-hint">
            Local PDF Tools can fill a file you choose and download a copy on
            your device. It does not save that copy in Career Vault.
          </p>
        </div>
        <ActionLink href="/resumes/pdf-tools" variant="secondary">
          Open local PDF Tools
        </ActionLink>
      </Card>
      {employmentForm && (
        <EmploymentForm
          record={employmentForm.record}
          id={employmentForm.id}
          applications={applications}
          offers={offers.error ? [] : offers.offers}
          save={save}
          onClose={() => setEmploymentForm(null)}
          opener={opener}
        />
      )}
      {documentForm && (
        <EmploymentDocumentForm
          record={documentForm.record}
          entry={documentForm.entry}
          documentId={documentForm.id}
          library={documents.error ? null : documents.library}
          save={save}
          onClose={() => setDocumentForm(null)}
          opener={opener}
        />
      )}
    </>
  );
}
