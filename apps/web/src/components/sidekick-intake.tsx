'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  applicationFromCapture,
  canonicalPostingUrl,
  isCaptureId,
  type JobCapture,
} from '@fats/domain';
import { useAccount } from './account-provider';
import { SessionNotice } from './session-notice';
import { useApplications } from './application-provider';
import { requestSidekickCapture } from '@/lib/sidekick-bridge';
import { ActionLink, Button, Card, PageHeading } from './ui';

function CaptureConfirmation({ capture }: { capture: JobCapture }) {
  const account = useAccount();
  const {
    applications,
    createCapturedApplication,
    error: storageError,
  } = useApplications();
  const [job, setJob] = useState(capture.job);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState(''),
    [savedId, setSavedId] = useState('');
  const savingRef = useRef(false);
  const existing = applications.find(
    (row) =>
      row.id === capture.id ||
      canonicalPostingUrl(row.sourceUrl) ===
        canonicalPostingUrl(capture.job.sourceUrl),
  );
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await createCapturedApplication(
        capture,
        applicationFromCapture(job),
      );
      setSavedId(saved.id);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'The job could not be saved. Keep this form open and retry.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  if (savedId || existing)
    return (
      <Card className="content-card">
        <h2>
          {savedId
            ? 'Your opportunity is saved.'
            : 'This opportunity is already saved.'}
        </h2>
        <p role="status">
          Your tracker has one record for this posting. Existing details were
          kept.
        </p>
        <ActionLink href={`/applications/${savedId || existing!.id}`}>
          Open saved application
        </ActionLink>
      </Card>
    );
  return (
    <Card className="content-card">
      <h2>Check the details before saving</h2>
      <p>
        Nothing is saved until you confirm. Work arrangement will be included in
        the location. Saving does not apply for the job.
      </p>
      <SessionNotice />
      {!account.user && (
        <p className="backup-warning">
          You are using the local workspace.{' '}
          <a
            className="text-link"
            href={`/sign-in?next=${encodeURIComponent('/sidekick#' + capture.id)}`}
          >
            Sign in to save to your account
          </a>
          , or confirm below to save in this browser.
        </p>
      )}
      <form className="job-form" onSubmit={save}>
        <fieldset disabled={saving || !!storageError || account.expired}>
          {(
            [
              ['title', 'Job title', 160],
              ['company', 'Company', 160],
              ['location', 'Location', 160],
              ['workArrangement', 'Work arrangement (optional)', 80],
              ['sourceUrl', 'Original posting URL', 2048],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key}>
              {label}
              <input
                name={key}
                required={!['workArrangement', 'location'].includes(key)}
                type={key === 'sourceUrl' ? 'url' : 'text'}
                maxLength={max}
                value={job[key]}
                onChange={(event) =>
                  setJob({ ...job, [key]: event.target.value })
                }
              />
            </label>
          ))}
          <label>
            Job description (optional)
            <textarea
              name="description"
              rows={8}
              maxLength={20000}
              value={job.description}
              onChange={(event) =>
                setJob({ ...job, description: event.target.value })
              }
            />
          </label>
        </fieldset>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <span className="field-hint">
            {account.user
              ? 'Saved to your signed-in FATS account.'
              : 'Saved in this browser, in this FATS workspace.'}
          </span>
          <Button
            type="submit"
            disabled={saving || !!storageError || account.expired}
          >
            {saving ? 'Saving…' : 'Confirm and save'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
export function SidekickIntake() {
  const { applications, loading, openForm } = useApplications();
  const [capture, setCapture] = useState<JobCapture | null>(null),
    [error, setError] = useState(''),
    [waiting, setWaiting] = useState(true),
    [attempt, setAttempt] = useState(0);
  const [id] = useState(() =>
    typeof window === 'undefined' ? '' : location.hash.slice(1),
  );
  useEffect(() => {
    const controller = new AbortController();
    void requestSidekickCapture(id, controller.signal)
      .then(
        (capture) => {
          if (!controller.signal.aborted) setCapture(capture);
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setError(
              error instanceof Error ? error.message : 'Capture unavailable.',
            );
        },
      )
      .finally(() => {
        if (!controller.signal.aborted) setWaiting(false);
      });
    return () => controller.abort();
  }, [attempt, id]);
  const existing = isCaptureId(id)
    ? applications.find((row) => row.id === id)
    : undefined;
  return (
    <>
      <PageHeading
        eyebrow="FATS Sidekick"
        title="Make room for a new opportunity."
        description="Review your captured job, then choose whether to save it."
      />
      {existing && !loading ? (
        <Card className="content-card">
          <h2>This opportunity is already saved.</h2>
          <p>No duplicate was added.</p>
          <ActionLink href={`/applications/${existing.id}`}>
            Open saved application
          </ActionLink>
        </Card>
      ) : loading || waiting ? (
        <p className="loading-state" role="status">
          Loading your capture…
        </p>
      ) : capture ? (
        <CaptureConfirmation key={capture.id} capture={capture} />
      ) : (
        <Card className="content-card">
          <h2>Let’s bring the details together.</h2>
          <p className="error-message" role="alert">
            {error}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setError('');
              setWaiting(true);
              setAttempt((value) => value + 1);
            }}
          >
            Retry capture
          </Button>
        </Card>
      )}
      <Card className="content-card sidekick-manual">
        <h2>Prefer to paste it yourself?</h2>
        <p>
          You can always enter a job manually. No extension or supported website
          is required.
        </p>
        <Button variant="secondary" onClick={() => openForm()}>
          Save a job manually
        </Button>
      </Card>
    </>
  );
}
