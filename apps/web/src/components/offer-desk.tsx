'use client';
import { useRef, useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FileCheck2, X } from 'lucide-react';
import {
  OFFER_CHECKLIST,
  REVIEW_STATES,
  PAY_FREQUENCIES,
  WORK_ARRANGEMENTS,
  latestOfferTerms,
  offerDeadline,
  offerSalary,
  offerToday,
  validateOfferCommand,
  type Offer,
  type OfferCommand,
  type OfferState,
  type OfferTerms,
  type DocumentVersion,
} from '@fats/domain';
import { useOffers } from './offer-provider';
import { useAccount } from './account-provider';
import { useApplications } from './application-provider';
import { useDocuments } from './document-provider';
import { VersionActions, PdfPreview } from './document-library';
import { ActionLink, Button, Card, TextLink } from './ui';
import { SessionNotice } from './session-notice';

const decisionLabels: Record<OfferState, string> = {
  reviewing: 'Continue reviewing',
  accepted: 'Record acceptance',
  declined: 'Record decline',
  withdrawn: 'Mark withdrawn by employer',
};
const stateLabels: Record<OfferState, string> = {
  reviewing: 'Reviewing',
  accepted: 'Acceptance recorded',
  declined: 'Decline recorded',
  withdrawn: 'Withdrawn by employer',
};
type Editor =
  | { kind: 'terms' }
  | { kind: 'negotiation' }
  | { kind: 'review' }
  | { kind: 'decision'; decision: OfferState };
function blankTerms(): OfferTerms {
  return {
    receivedOn: '',
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
}
function TermsSummary({ terms }: { terms: OfferTerms }) {
  return (
    <dl className="offer-terms">
      <div>
        <dt>Gross salary</dt>
        <dd>{offerSalary(terms)}</dd>
      </div>
      <div>
        <dt>Received</dt>
        <dd>{terms.receivedOn}</dd>
      </div>
      <div>
        <dt>Employment type</dt>
        <dd>{terms.employmentType || 'Unspecified'}</dd>
      </div>
      <div>
        <dt>Work arrangement</dt>
        <dd>{terms.arrangement || 'Unspecified'}</dd>
      </div>
      <div>
        <dt>Work location</dt>
        <dd>{terms.location || 'Unspecified'}</dd>
      </div>
      <div>
        <dt>Proposed start</dt>
        <dd>{terms.startOn || 'Unspecified'}</dd>
      </div>
      <div>
        <dt>Response deadline</dt>
        <dd>
          {terms.deadlineOn
            ? `${terms.deadlineOn} · ${terms.timeZone}`
            : 'Unspecified'}
        </dd>
      </div>
      <div>
        <dt>Benefits and allowances</dt>
        <dd>{terms.benefits || 'Not recorded'}</dd>
      </div>
      <div>
        <dt>Important terms or notes</dt>
        <dd>{terms.notes || 'Not recorded'}</dd>
      </div>
    </dl>
  );
}
function OfferAttachment({
  versionId,
  unavailable = false,
}: {
  versionId: string;
  unavailable?: boolean;
}) {
  const { library, error } = useDocuments();
  const [preview, setPreview] = useState<DocumentVersion | null>(null);
  if (!versionId)
    return (
      <p className="field-hint">
        {unavailable
          ? 'Letter not included in the JSON backup. Its historical reference is retained without a file link. Upload a copy to your library and record its exact version when ready.'
          : 'No letter linked to these terms.'}
      </p>
    );
  const document = library?.documents.find((d) =>
    d.versions.some((v) => v.id === versionId),
  );
  const version = document?.versions.find((v) => v.id === versionId);
  return (
    <div className="offer-attachment">
      {version ? (
        <>
          <p>
            <strong>{document?.name}</strong>
            {document?.archived ? ' · Archived' : ''}
            <br />
            Version {version.number} · {version.originalFilename}
          </p>
          <VersionActions version={version} onPreview={setPreview} />
        </>
      ) : (
        <p role="status">{error || 'Loading linked document…'}</p>
      )}
      <PdfPreview version={preview} close={() => setPreview(null)} />
    </div>
  );
}
export function OfferDesk({ applicationId }: { applicationId: string }) {
  const account = useAccount(),
    { applications } = useApplications();
  const { offers, loading, error, now, refresh } = useOffers();
  const [editor, setEditor] = useState<Editor | null>(null),
    [notice, setNotice] = useState('');
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const offer = offers.find((o) => o.applicationId === applicationId);
  const application = applications.find((a) => a.id === applicationId);
  if (!offer && application?.status !== 'Offer') return null;
  const terms = offer && latestOfferTerms(offer),
    deadline = terms && offerDeadline(terms, now);
  function open(next: Editor) {
    setOpener(document.activeElement as HTMLElement);
    setEditor(next);
    setNotice('');
  }
  return (
    <Card className="offer-desk" id="offer-desk">
      <div className="section-heading">
        <h2>
          <FileCheck2 size={19} aria-hidden="true" /> Offer Desk
        </h2>
        {offer && <span className="pill">{stateLabels[offer.state]}</span>}
      </div>
      {!account.user ? (
        <>
          <p>Your first offer, one step at a time.</p>
          <p className="muted">
            Sign in to record private offer terms, review questions, and exact
            offer-letter versions. Your browser applications stay separate;
            transfer them in Settings after signing in.
          </p>
          <ActionLink
            href={`/sign-in?next=${encodeURIComponent(`/applications/${applicationId}#offer-desk`)}`}
            variant="secondary"
          >
            Sign in for Offer Desk
          </ActionLink>
        </>
      ) : loading ? (
        <p role="status">Loading offer…</p>
      ) : error ? (
        <>
          <p role="alert" className="error-message">
            {error}
          </p>
          <Button
            variant="secondary"
            onClick={() => void refresh().catch(() => {})}
          >
            Retry loading offers
          </Button>
        </>
      ) : !offer ? (
        <>
          <p>An offer is a big step. Start with what you know.</p>
          <p className="muted">
            You only need the date you received it. Add the rest whenever you’re
            ready.
          </p>
          <Button
            disabled={account.expired}
            onClick={() => open({ kind: 'terms' })}
          >
            Record offer
          </Button>
        </>
      ) : (
        terms && (
          <>
            <p className="offer-salary">{offerSalary(terms)}</p>
            {deadline && (
              <p
                className={`offer-deadline ${offer.state === 'reviewing' ? deadline.tone : ''}`}
              >
                {offer.state === 'reviewing'
                  ? deadline.label
                  : `Recorded response deadline: ${terms.deadlineOn}`}{' '}
                · {terms.timeZone}
              </p>
            )}
            {deadline?.tone === 'passed' && offer.state === 'reviewing' && (
              <p className="field-hint">
                A passed deadline does not mean the employer withdrew the offer.
              </p>
            )}
            <details>
              <summary>Review current terms</summary>
              <TermsSummary terms={terms} />
            </details>
            <OfferAttachment
              versionId={terms.documentVersionId}
              unavailable={Boolean(
                [...offer.events].reverse().find((event) => event.terms)
                  ?.unavailableDocumentReference,
              )}
            />
            <div className="document-actions">
              <Button
                variant="secondary"
                disabled={account.expired || offer.state !== 'reviewing'}
                onClick={() => open({ kind: 'terms' })}
              >
                Record revised terms or letter
              </Button>
              <TextLink href="/resumes">
                Upload a letter in your library
              </TextLink>
            </div>
            <div className="offer-review-summary">
              <h3>A little clarity before you decide</h3>
              <p>
                {offer.checklist.filter((s) => s === 'Reviewed').length} of{' '}
                {OFFER_CHECKLIST.length} terms reviewed ·{' '}
                {offer.checklist.filter((s) => s === 'Need to clarify').length}{' '}
                to clarify
              </p>
              <Button
                variant="secondary"
                disabled={account.expired}
                onClick={() => open({ kind: 'review' })}
              >
                Review checklist and HR questions
              </Button>
              {offer.questions && (
                <p className="job-description">
                  <strong>Your questions for HR</strong>
                  <br />
                  {offer.questions}
                </p>
              )}
              <p className="field-hint">
                A guide to useful questions, not legal advice or confirmation
                that a contract is valid. You can record a decision at any
                point.
              </p>
            </div>
            <div className="document-actions">
              {(['accepted', 'declined', 'reviewing', 'withdrawn'] as const)
                .filter((state) => state !== offer.state)
                .map((state) => (
                  <Button
                    key={state}
                    variant="secondary"
                    disabled={account.expired}
                    onClick={() => open({ kind: 'decision', decision: state })}
                  >
                    {decisionLabels[state]}
                  </Button>
                ))}
            </div>
            <p className="field-hint">
              This saves your decision in FATS. Tell the employer through their
              required channel. Your application stage stays the same; you can
              update it separately.
            </p>
            <details className="offer-history">
              <summary>Offer history</summary>
              <ol>
                {offer.events
                  .filter((e) => e.kind !== 'review')
                  .map((event, index) => (
                    <li key={event.requestId}>
                      <p>
                        <strong>
                          {event.occurredOn} ·{' '}
                          {event.kind === 'terms'
                            ? index === 0
                              ? 'Original offer'
                              : 'Revised terms'
                            : event.kind === 'decision'
                              ? stateLabels[event.decision!]
                              : 'Negotiation note'}
                        </strong>
                      </p>
                      {event.notes && (
                        <p className="job-description">{event.notes}</p>
                      )}
                      {event.terms && (
                        <>
                          <p>{offerSalary(event.terms)}</p>
                          <details>
                            <summary>
                              Terms and letter for this revision
                            </summary>
                            <TermsSummary terms={event.terms} />
                            <OfferAttachment
                              versionId={event.terms.documentVersionId}
                              unavailable={Boolean(
                                event.unavailableDocumentReference,
                              )}
                            />
                          </details>
                        </>
                      )}
                    </li>
                  ))}
              </ol>
            </details>
            <Button
              variant="ghost"
              disabled={account.expired || offer.state !== 'reviewing'}
              onClick={() => open({ kind: 'negotiation' })}
            >
              Add negotiation note
            </Button>
          </>
        )
      )}
      {account.user && (
        <p role="status" aria-label="Offer save status">
          {notice}
        </p>
      )}
      {editor && (
        <OfferEditor
          applicationId={applicationId}
          offer={offer}
          editor={editor}
          opener={opener}
          close={() => setEditor(null)}
          saved={() => {
            setEditor(null);
            setNotice('Offer saved. Your earlier history is preserved.');
          }}
        />
      )}
    </Card>
  );
}

function OfferEditor({
  applicationId,
  offer: savedOffer,
  editor,
  opener,
  close,
  saved,
}: {
  applicationId: string;
  offer: Offer | undefined;
  editor: Editor;
  opener: HTMLElement | null;
  close: () => void;
  saved: () => void;
}) {
  const { command, refresh } = useOffers(),
    { library } = useDocuments(),
    account = useAccount();
  // Keep the editor's creation/edit mode stable if a refresh discovers a write
  // whose response was lost. Its unchanged retry must use the same command.
  const [offer] = useState(savedOffer);
  const [baseVersion, setBaseVersion] = useState(offer?.version ?? 0);
  const [terms, setTerms] = useState(() =>
    offer ? latestOfferTerms(offer)! : blankTerms(),
  );
  const [compensationInitiallyOpen] = useState(Boolean(terms.salaryAmount));
  const [occurredOn, setOccurredOn] = useState(() =>
    offerToday(terms.timeZone),
  );
  const [notes, setNotes] = useState(''),
    [checklist, setChecklist] = useState(
      offer?.checklist ?? OFFER_CHECKLIST.map(() => 'Not reviewed' as const),
    ),
    [questions, setQuestions] = useState(offer?.questions ?? '');
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(''),
    [reloaded, setReloaded] = useState('');
  const pending = useRef<{ key: string; id: string } | null>(null);
  const title =
    editor.kind === 'terms'
      ? offer
        ? 'Record revised offer terms'
        : 'Record offer'
      : editor.kind === 'review'
        ? 'Review your offer'
        : editor.kind === 'negotiation'
          ? 'Add negotiation note'
          : decisionLabels[editor.decision];
  function field<K extends keyof OfferTerms>(key: K, value: OfferTerms[K]) {
    setTerms((previous) => ({ ...previous, [key]: value }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure('');
    try {
      const input: OfferCommand = validateOfferCommand(
        editor.kind === 'terms'
          ? {
              kind: 'terms',
              occurredOn: offer ? occurredOn : terms.receivedOn,
              notes,
              terms,
            }
          : editor.kind === 'review'
            ? { kind: 'review', occurredOn, checklist, questions }
            : editor.kind === 'negotiation'
              ? { kind: 'negotiation', occurredOn, notes }
              : {
                  kind: 'decision',
                  occurredOn,
                  notes,
                  decision: editor.decision,
                  confirmed: true,
                },
      );
      const key = JSON.stringify({ input, baseVersion });
      if (pending.current?.key !== key)
        pending.current = { key, id: crypto.randomUUID() };
      await command(applicationId, baseVersion, pending.current.id, input);
      saved();
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : 'The offer could not be saved. Keep your inputs and retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  const input = (
    key: keyof OfferTerms,
    label: string,
    type = 'text',
    required = false,
  ) => (
    <label>
      {label}
      <input
        name={key}
        type={type}
        inputMode={key === 'salaryAmount' ? 'decimal' : undefined}
        min={type === 'date' ? '1900-01-01' : undefined}
        max={type === 'date' ? '2200-12-31' : undefined}
        required={required}
        maxLength={
          key === 'currency'
            ? 3
            : key === 'timeZone'
              ? 100
              : key === 'employmentType'
                ? 160
                : 500
        }
        value={terms[key]}
        onChange={(event) => field(key, event.target.value)}
      />
    </label>
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content offer-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener?.isConnected) opener.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="dialog-heading">
            <span className="icon-tile mint">
              <FileCheck2 size={22} />
            </span>
            <Dialog.Close asChild>
              <Button
                className="icon-button"
                variant="ghost"
                aria-label="Close offer form"
                disabled={busy}
              >
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description className="muted">
            {editor.kind === 'decision'
              ? 'Record a real-world decision. This action does not communicate with the employer or legally accept an offer.'
              : 'Keep what you know. Unspecified details can wait.'}
          </Dialog.Description>
          <form className="job-form" onSubmit={submit}>
            <fieldset disabled={busy || account.expired}>
              {editor.kind !== 'terms' || offer ? (
                <label>
                  {editor.kind === 'decision' ? 'Decision date' : 'Entry date'}
                  <input
                    type="date"
                    required
                    min="1900-01-01"
                    max="2200-12-31"
                    value={occurredOn}
                    onChange={(event) => setOccurredOn(event.target.value)}
                  />
                </label>
              ) : null}
              {editor.kind === 'terms' && (
                <>
                  {input(
                    'receivedOn',
                    'Date offer received (required)',
                    'date',
                    true,
                  )}
                  <details open={compensationInitiallyOpen}>
                    <summary>Salary and benefits (optional)</summary>
                    <div className="form-grid">
                      {input('salaryAmount', 'Gross salary amount')}
                      {input('currency', 'Currency', 'text', true)}
                    </div>
                    <p className="field-hint">
                      Use the gross amount before deductions, without commas.
                      Leave blank if unknown.
                    </p>
                    <label>
                      Payment frequency
                      <select
                        value={terms.frequency}
                        onChange={(event) =>
                          field(
                            'frequency',
                            event.target.value as OfferTerms['frequency'],
                          )
                        }
                      >
                        {PAY_FREQUENCIES.map((value) => (
                          <option value={value} key={value}>
                            {value || 'Unspecified'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Benefits and allowances
                      <textarea
                        maxLength={5000}
                        rows={3}
                        value={terms.benefits}
                        onChange={(event) =>
                          field('benefits', event.target.value)
                        }
                      />
                    </label>
                  </details>
                  <details>
                    <summary>Work and important dates (optional)</summary>
                    {input('employmentType', 'Employment type')}
                    <label>
                      Work arrangement
                      <select
                        value={terms.arrangement}
                        onChange={(event) =>
                          field(
                            'arrangement',
                            event.target.value as OfferTerms['arrangement'],
                          )
                        }
                      >
                        {WORK_ARRANGEMENTS.map((value) => (
                          <option value={value} key={value}>
                            {value || 'Unspecified'}
                          </option>
                        ))}
                      </select>
                    </label>
                    {input('location', 'Work location')}
                    <div className="form-grid">
                      {input('startOn', 'Proposed start date', 'date')}
                      {input('deadlineOn', 'Offer response deadline', 'date')}
                    </div>
                    {input('timeZone', 'Offer timezone (IANA)', 'text', true)}
                    <p className="field-hint">
                      Dates are calendar days in this timezone. A deadline
                      remains due throughout its date; ask HR if an exact time
                      matters.
                    </p>
                  </details>
                  <details>
                    <summary>Contract notes and letter (optional)</summary>
                    <label>
                      Important contract terms or notes
                      <textarea
                        maxLength={5000}
                        rows={4}
                        value={terms.notes}
                        onChange={(event) => field('notes', event.target.value)}
                      />
                    </label>
                    <label>
                      Offer letter or contract version
                      <select
                        value={terms.documentVersionId}
                        onChange={(event) =>
                          field('documentVersionId', event.target.value)
                        }
                      >
                        <option value="">No letter selected</option>
                        {library?.documents
                          .filter(
                            (d) =>
                              !d.archived ||
                              d.versions.some(
                                (v) => v.id === terms.documentVersionId,
                              ),
                          )
                          .map((d) => (
                            <optgroup key={d.id} label={d.name}>
                              {d.versions.map((v) => (
                                <option
                                  key={v.id}
                                  value={v.id}
                                  disabled={
                                    v.health !== 'available' &&
                                    v.id !== terms.documentVersionId
                                  }
                                >
                                  Version {v.number} · {v.originalFilename}
                                  {v.health !== 'available'
                                    ? ` · ${v.health}`
                                    : ''}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                      </select>
                    </label>
                    <p className="field-hint">
                      Save your offer, upload PDF/DOCX in the document library,
                      then record a revision selecting its exact version.
                      Earlier linked versions remain in history.
                    </p>
                  </details>
                </>
              )}
              {editor.kind === 'review' && (
                <>
                  <div className="offer-checklist">
                    {OFFER_CHECKLIST.map((label, index) => (
                      <label key={label}>
                        {label}
                        <select
                          value={checklist[index]}
                          onChange={(event) =>
                            setChecklist((previous) =>
                              previous.map((state, i) =>
                                i === index
                                  ? (event.target.value as typeof state)
                                  : state,
                              ),
                            )
                          }
                        >
                          {REVIEW_STATES.map((state) => (
                            <option key={state}>{state}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <label>
                    Your questions for HR
                    <textarea
                      rows={4}
                      maxLength={5000}
                      value={questions}
                      onChange={(event) => setQuestions(event.target.value)}
                    />
                  </label>
                  <p className="field-hint">
                    This checklist is guidance, not legal advice. No checklist
                    completion is required to record a decision.
                  </p>
                </>
              )}
              {editor.kind !== 'review' &&
                (editor.kind !== 'terms' || offer) && (
                  <label>
                    {editor.kind === 'negotiation'
                      ? 'Negotiation note (required)'
                      : 'Entry notes (optional)'}
                    <textarea
                      rows={3}
                      required={editor.kind === 'negotiation'}
                      maxLength={5000}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </label>
                )}
              {editor.kind === 'decision' && (
                <label className="offer-confirm">
                  <input type="checkbox" required />I confirm this records my
                  real-world decision. I will communicate it through the
                  employer’s required channel. Earlier offer history will be
                  kept.
                </label>
              )}
            </fieldset>
            {failure && (
              <div role="alert" className="error-message">
                <p>{failure}</p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const rows = await refresh();
                      const current = rows.find(
                        (o) => o.applicationId === applicationId,
                      );
                      setBaseVersion(current?.version ?? 0);
                      pending.current = null;
                      setReloaded(
                        `Saved offer reloaded: ${current ? stateLabels[current.state] + ' · ' + offerSalary(latestOfferTerms(current)!) : 'No offer recorded'}. Review your draft before saving.`,
                      );
                      setFailure('');
                    } catch (error) {
                      setFailure(
                        error instanceof Error
                          ? error.message
                          : 'Reload failed.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Reload saved offer; keep my draft
                </Button>
              </div>
            )}
            {reloaded && <p role="status">{reloaded}</p>}
            <SessionNotice />
            <div className="form-footer">
              <span className="field-hint">
                Private to your verified account.
              </span>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={close}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || account.expired}>
                  {busy
                    ? 'Saving…'
                    : editor.kind === 'decision'
                      ? `Confirm: ${decisionLabels[editor.decision].toLowerCase()}`
                      : editor.kind === 'terms'
                        ? offer
                          ? 'Save revised terms'
                          : 'Save offer'
                        : editor.kind === 'review'
                          ? 'Save review'
                          : 'Save negotiation note'}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function OfferNextSteps() {
  const { offers, error, now } = useOffers(),
    { applications } = useApplications();
  const account = useAccount();
  if (!account.user) return null;
  if (error)
    return (
      <p role="alert" className="error-message">
        Offer deadlines unavailable: {error}
      </p>
    );
  const due = offers
    .filter((o) => o.state === 'reviewing')
    .map((offer) => ({ offer, terms: latestOfferTerms(offer)! }))
    .filter(({ terms }) => terms.deadlineOn)
    .sort((a, b) => a.terms.deadlineOn.localeCompare(b.terms.deadlineOn));
  if (!due.length) return null;
  return (
    <Card className="offer-next-steps">
      <div className="section-heading">
        <h2>Offer responses</h2>
      </div>
      <p className="muted">A little time to review, a clear next step.</p>
      {due.map(({ offer, terms }) => {
        const app = applications.find((a) => a.id === offer.applicationId),
          deadline = offerDeadline(terms, now)!;
        return (
          <div className="offer-next-row" key={offer.applicationId}>
            <div>
              <strong>
                {app?.company ?? 'Saved application'} · {app?.title}
              </strong>
              <p className={`offer-deadline ${deadline.tone}`}>
                {deadline.label} · {terms.timeZone}
              </p>
            </div>
            <ActionLink
              href={`/applications/${encodeURIComponent(offer.applicationId)}#offer-desk`}
              variant="secondary"
            >
              Review offer
            </ActionLink>
          </div>
        );
      })}
    </Card>
  );
}
