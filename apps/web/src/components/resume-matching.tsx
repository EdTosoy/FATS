'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import {
  matchingSuggestion,
  type MatchPreview,
  type MatchingReport,
  type MatchingConfig,
} from '@fats/domain';
import { useAccount } from './account-provider';
import { useApplications } from './application-provider';
import { useDocuments } from './document-provider';
import {
  SESSION_EXPIRED_EVENT,
  ACCOUNT_CHANGED_EVENT,
} from '@/lib/http-workspace-repository';
import { Card, Button, ActionLink } from './ui';
interface MatchingState {
  provider: {
    label: string;
    external: boolean;
    configuration: MatchingConfig;
  } | null;
  reports: MatchingReport[];
}
const labels = {
  demonstrated: 'Evidence found',
  partial: 'Partially documented',
  undocumented: 'Not documented',
  unclear: 'Needs clarification',
};
const failures: Record<string, string> = {
  timeout:
    'The provider took too long. This attempt may have been charged. You can explicitly try a new comparison.',
  unavailable:
    'The provider is unavailable. Your records are unchanged; try a new comparison later.',
  invalid_output:
    'The AI response did not pass the structure or evidence checks. No conclusions were accepted.',
  refused:
    'The provider could not analyze this text. Review the source text before trying again.',
  interrupted:
    'This comparison was interrupted. No result was accepted. Review and compare again.',
};
function MatchingView({ applicationId }: { applicationId: string }) {
  const account = useAccount(),
    { applications } = useApplications(),
    { library } = useDocuments();
  const application = applications.find((a) => a.id === applicationId);
  const [state, setState] = useState<MatchingState | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<MatchPreview | null>(null),
    [consent, setConsent] = useState(false),
    [requestId, setRequestId] = useState(''),
    [versionId, setVersionId] = useState(''),
    [extraction, setExtraction] = useState(''),
    [deleting, setDeleting] = useState<string | null>(null);
  const sequence = useRef(0);
  const request = useCallback(
    async (body?: Record<string, unknown>) => {
      const response = await fetch(
        '/api/matching?applicationId=' + encodeURIComponent(applicationId),
        {
          method: body ? 'POST' : 'GET',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'x-fats-account': account.user?.id ?? '',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401)
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        if (data.code === 'ACCOUNT_CHANGED')
          window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT));
        throw new Error(
          data.error ??
            'Comparison is unavailable. Keep your selection and retry.',
        );
      }
      return data;
    },
    [applicationId, account.user?.id],
  );
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const data = await request();
      if (current === sequence.current) {
        setState(data);
        setError('');
      }
    } catch (error) {
      if (current === sequence.current)
        setError(
          error instanceof Error ? error.message : 'Comparison unavailable.',
        );
    }
  }, [request]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', focus);
    };
  }, [refresh, application?.description]);
  const running = state?.reports.some((r) => r.status === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [running, refresh]);
  async function prepare() {
    setBusy(true);
    setError('');
    setExtraction('');
    setPreview(null);
    setConsent(false);
    try {
      const data = await request({ action: 'prepare', versionId });
      if (data.extraction) setExtraction(data.extraction.message);
      else {
        setPreview(data);
        setRequestId(crypto.randomUUID());
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Extraction failed. Your documents are unchanged.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function compare() {
    if (!preview || !consent) return;
    setBusy(true);
    setError('');
    try {
      await request({
        action: 'compare',
        previewId: preview.id,
        requestId,
        confirmed: true,
      });
      setPreview(null);
      setConsent(false);
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Comparison failed. Retry this request to check whether it completed.',
      );
    } finally {
      setBusy(false);
    }
  }
  const versions =
    library?.documents
      .filter((d) => d.category === 'Resumes')
      .flatMap((d) => d.versions.map((v) => ({ document: d, version: v }))) ??
    [];
  return (
    <Card className="resume-matching" aria-labelledby="matching-title">
      <div className="section-heading">
        <h2 id="matching-title">
          <Sparkles size={18} aria-hidden="true" />
          Resume comparison
        </h2>
        <span className="pill mint-pill">Your evidence, explained</span>
      </div>
      <p>
        Explore how your documented experience relates to this job. This does
        not change your resume, submitted version, or application.
      </p>
      <p className="field-hint">
        AI can misunderstand context. “Not documented” means the reviewed text
        did not show it; it does not mean you lack the skill. No score or hiring
        prediction is provided.
      </p>
      {!state && !error ? (
        <p role="status">Checking comparison availability…</p>
      ) : state?.provider ? (
        <>
          <p className="field-hint">
            {state.provider.label}
            {!state.provider.external
              ? ' · Automated tests only; no live AI or external transmission.'
              : ''}
          </p>
          <label className="matching-selector">
            Resume version to compare
            <select
              aria-label="Resume version to compare"
              value={versionId}
              disabled={busy || account.expired}
              onChange={(event) => {
                setVersionId(event.target.value);
                setPreview(null);
                setConsent(false);
              }}
            >
              <option value="">Choose an exact resume version</option>
              {versions.map(({ document, version }) => (
                <option
                  key={version.id}
                  value={version.id}
                  disabled={version.health !== 'available'}
                >
                  {document.name} · Version {version.number}
                  {document.archived ? ' · Archived' : ''}
                  {version.health !== 'available' ? ` · ${version.health}` : ''}
                </option>
              ))}
            </select>
          </label>
          {!versions.length && (
            <ActionLink href="/resumes" variant="secondary">
              Add a resume to your library
            </ActionLink>
          )}
          <Button
            variant="secondary"
            disabled={busy || !versionId || account.expired || running}
            onClick={() => void prepare()}
          >
            {busy ? 'Working…' : 'Review text before comparing'}
          </Button>
        </>
      ) : (
        state && (
          <p className="matching-unavailable">
            AI comparison is unavailable. No provider is configured. Your files
            stay private; saved reports remain available below.
          </p>
        )
      )}
      {extraction && (
        <p role="alert" className="error-message">
          {extraction}
        </p>
      )}
      {preview && (
        <section className="matching-review" aria-label="Review text to share">
          <h3>Review what will be shared</h3>
          <p>
            {state?.provider?.external
              ? 'Only the text below goes to OpenAI. Original files, filenames, account details, source URLs, and notes are excluded. Contact removal is best-effort: check the text yourself.'
              : 'This is an automated test fixture. No text leaves the test server.'}
          </p>
          {preview.sources.warnings.map((w) => (
            <p className="field-hint" key={w}>
              {w}
            </p>
          ))}
          <div className="matching-sources">
            {(['resume', 'job'] as const).map((kind) => (
              <details key={kind} open>
                <summary>
                  {kind === 'resume' ? 'Resume text' : 'Saved job text'}
                </summary>
                <ol>
                  {preview.sources[kind].map((s) => (
                    <li key={s.id}>
                      <small>
                        {s.id} · {s.location}
                      </small>
                      <p>{s.text}</p>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
          <p className="field-hint">
            {state?.provider?.external
              ? 'OpenAI may retain content in abuse-monitoring logs, generally up to 30 days with exceptions. FATS requests no stored response. Private reports and reviewed text expire after 30 days and are removed on your next comparison access; you can delete them earlier. Provider attempts, including failures, count toward daily limits.'
              : 'Fixture results are deterministic test data and are not live AI analysis.'}
          </p>
          <label className="matching-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
            />
            {state?.provider?.external
              ? 'I reviewed this text and agree to send it to OpenAI for this comparison.'
              : 'I reviewed this test text and want to run the labelled fixture.'}
          </label>
          <div className="document-actions">
            <Button
              disabled={!consent || busy || running || account.expired}
              onClick={() => void compare()}
            >
              {busy
                ? 'Comparing…'
                : state?.provider?.external
                  ? 'Send text and compare'
                  : 'Run test comparison'}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setConsent(false);
              }}
            >
              Cancel comparison
            </Button>
          </div>
        </section>
      )}
      {error && (
        <div>
          <p role="alert" className="error-message">
            {error}
          </p>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void refresh()}
          >
            Refresh reports
          </Button>
        </div>
      )}
      {state?.reports.length ? (
        <section className="matching-history">
          <h3>Your comparisons</h3>
          {state.reports.map((report) => {
            const resume = versions.find(
              (v) => v.version.id === report.versionId,
            );
            return (
              <details
                className="matching-report"
                key={report.id}
                open={state.reports[0]?.id === report.id}
              >
                <summary>
                  {report.status === 'complete'
                    ? 'Comparison'
                    : report.status === 'running'
                      ? 'Comparison in progress'
                      : 'Comparison not completed'}{' '}
                  · {new Date(report.createdAt).toLocaleString('en-PH')}
                  {report.outdated ? ' · Previous job description' : ''}
                </summary>
                <p className="field-hint">
                  {resume?.document.name ?? 'Saved resume'} · Version{' '}
                  {resume?.version.number ?? 'saved'} · Job revision{' '}
                  {report.jobRevision} ·{' '}
                  {report.configuration.provider === 'test-fixture'
                    ? 'Automated test fixture — no live AI'
                    : report.configuration.model}
                </p>
                {report.outdated && (
                  <p className="matching-warning">
                    The job description has changed. This report reflects the
                    earlier text. Review the new text and explicitly compare
                    again.
                  </p>
                )}
                {report.status === 'running' ? (
                  <p role="status">
                    Comparison is running. Refresh or return shortly; starting
                    another request will not retry it automatically.
                  </p>
                ) : report.status === 'failed' ? (
                  <p role="alert" className="error-message">
                    {failures[report.failure ?? 'unavailable'] ??
                      failures.unavailable}
                  </p>
                ) : (
                  <>
                    <p className="field-hint">
                      AI assessments below are suggestions to review, not
                      verified qualifications. The report may not cover every
                      requirement.
                    </p>
                    {!report.result?.requirements.length && (
                      <p>
                        No clear requirements were identified. Clarify the saved
                        job text before comparing again.
                      </p>
                    )}
                    {report.result?.requirements.map((item, i) => (
                      <section
                        className={
                          'matching-requirement match-' + item.classification
                        }
                        key={i}
                      >
                        <span className="pill">
                          {labels[item.classification]}
                        </span>
                        <span className="field-hint">
                          {item.importance === 'mandatory'
                            ? 'Required in the posting'
                            : item.importance === 'preferred'
                              ? 'Preferred in the posting'
                              : 'Priority unclear'}
                        </span>
                        <h4>{item.job.quote}</h4>
                        <p className="field-hint">
                          Job evidence: {item.job.segmentId} · characters{' '}
                          {item.job.start}–{item.job.end}
                        </p>
                        {item.evidence.map((e, j) => (
                          <blockquote key={j}>
                            <p>{e.quote}</p>
                            <footer>
                              Resume {e.segmentId} ·{' '}
                              {
                                report.sources?.resume.find(
                                  (s) => s.id === e.segmentId,
                                )?.location
                              }{' '}
                              · characters {e.start}–{e.end}
                            </footer>
                          </blockquote>
                        ))}
                        {!item.evidence.length && (
                          <p>
                            No supporting resume excerpt was identified in the
                            reviewed text.
                          </p>
                        )}
                        <p>{matchingSuggestion(item.classification)}</p>
                      </section>
                    ))}
                    <details>
                      <summary>Reviewed source text</summary>
                      {report.sources &&
                        (['resume', 'job'] as const).map((kind) => (
                          <div key={kind}>
                            <h4>
                              {kind === 'resume' ? 'Resume' : 'Job description'}
                            </h4>
                            {report.sources![kind].map((s) => (
                              <p key={s.id}>
                                <small>
                                  {s.id} · {s.location}:{' '}
                                </small>
                                {s.text}
                              </p>
                            ))}
                          </div>
                        ))}
                    </details>
                  </>
                )}
                {report.status !== 'running' &&
                  (deleting === report.id ? (
                    <div className="document-actions">
                      <span>Delete this report and its reviewed text?</span>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await request({
                              action: 'delete',
                              id: report.id,
                              confirmed: true,
                            });
                            setDeleting(null);
                            await refresh();
                          } catch (error) {
                            setError(
                              error instanceof Error
                                ? error.message
                                : 'Report deletion failed.',
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Confirm report deletion
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setDeleting(null)}
                      >
                        Keep report
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setDeleting(report.id)}
                    >
                      Delete report…
                    </Button>
                  ))}
              </details>
            );
          })}
        </section>
      ) : null}
    </Card>
  );
}
export function ResumeMatching({ applicationId }: { applicationId: string }) {
  const account = useAccount();
  if (!account.user) return null;
  return <MatchingView key={applicationId} applicationId={applicationId} />;
}
