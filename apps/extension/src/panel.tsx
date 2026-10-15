import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  FATS_ORIGINS,
  normalizeCapturedJob,
  type CapturedJob,
} from '@fats/domain';
import { extractJobPage } from './extract';
import './panel.css';
const empty: CapturedJob = {
  title: '',
  company: '',
  location: '',
  workArrangement: '',
  description: '',
  sourceUrl: '',
};
function Sidekick() {
  const [job, setJob] = useState<CapturedJob>(empty);
  const [currentUrl, setCurrentUrl] = useState(
    'Click the Sidekick toolbar icon on the job page.',
  );
  const [origin, setOrigin] = useState<string>(FATS_ORIGINS[0]);
  const [busy, setBusy] = useState(false),
    [review, setReview] = useState(false);
  const [error, setError] = useState(''),
    [message, setMessage] = useState(
      'Capture when you are ready, or type and paste the job details.',
    );
  useEffect(() => {
    async function update() {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      setCurrentUrl(
        tab?.url ??
          'Page access is unavailable. Click the toolbar icon on the job page.',
      );
    }
    void update();
    chrome.tabs.onActivated.addListener(update);
    chrome.tabs.onUpdated.addListener(update);
    return () => {
      chrome.tabs.onActivated.removeListener(update);
      chrome.tabs.onUpdated.removeListener(update);
    };
  }, []);
  async function capture() {
    setBusy(true);
    setError('');
    setReview(false);
    setMessage('Reading this page only…');
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (!tab?.id)
        throw new Error(
          'No active page is available. Paste the details below.',
        );
      if (tab.url && !/^https?:\/\//.test(tab.url))
        throw new Error(
          'This page is unsupported. Open an HTTP(S) job page, or enter details manually.',
        );
      let result;
      try {
        [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractJobPage,
        });
      } catch {
        throw new Error(
          'Page access was denied or the page cannot be read. Click the Sidekick toolbar icon on the job page to grant temporary access, or paste details manually.',
        );
      }
      if (!result?.result)
        throw new Error(
          'Extraction failed. Paste or type the job details below.',
        );
      setJob(result.result.job);
      setCurrentUrl(result.result.job.sourceUrl);
      setMessage(
        [
          `Captured from ${result.result.method === 'structured' ? 'JobPosting structured data' : 'page metadata or semantic HTML'}. Please review every field.`,
          ...result.result.warnings,
        ].join(' '),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Extraction failed. Use manual entry.',
      );
      setMessage('You can still type the details and paste a job description.');
    } finally {
      setBusy(false);
    }
  }
  function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      setJob(normalizeCapturedJob(job));
      setReview(true);
      setMessage('Ready to review. Nothing has been saved to your tracker.');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Check the job details.',
      );
    }
  }
  async function handoff() {
    setBusy(true);
    setError('');
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'sidekick:stage',
        job: normalizeCapturedJob(job),
        origin,
      });
      if (!response?.ok)
        throw new Error(
          response?.error ??
            'FATS could not be opened. Check that the extension is enabled and try again.',
        );
      setMessage(
        'FATS is open. Confirm and save there; opening it has not saved this job.',
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Handoff failed. Your edited details remain here.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <header>
        <img
          src="icon-32.png"
          width="32"
          height="32"
          alt=""
          aria-hidden="true"
        />
        <div>
          <strong>
            FATS <span>Sidekick</span>
          </strong>
          <p>Your next opportunity, kept together.</p>
        </div>
      </header>
      <section className="page-context">
        <h1>One opportunity at a time</h1>
        <p className="muted">Current website</p>
        <p className="url">{currentUrl}</p>
        <button type="button" disabled={busy} onClick={() => void capture()}>
          Capture Job
        </button>
        <p className="hint">
          Reads this page only when you ask. It never applies for you.
        </p>
      </section>
      <p className="feedback" role="status">
        {message}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!review ? (
        <form onSubmit={inspect}>
          <h2>Check the details</h2>
          <p className="muted">
            Missing information stays blank. Correct it or paste it yourself.
          </p>
          <fieldset disabled={busy}>
            {(
              [
                ['title', 'Job title', 160],
                ['company', 'Company name', 160],
                ['location', 'Location', 160],
                ['workArrangement', 'Work arrangement (optional)', 80],
                ['sourceUrl', 'Original posting URL', 2048],
              ] as const
            ).map(([key, label, max]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  type={key === 'sourceUrl' ? 'url' : 'text'}
                  required={!['workArrangement', 'location'].includes(key)}
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
                placeholder="Paste responsibilities, requirements, or your own notes."
              />
            </label>
          </fieldset>
          <button type="submit" disabled={busy}>
            Review details
          </button>
        </form>
      ) : (
        <section className="review">
          <h2>Ready for your tracker?</h2>
          <h3>{job.title}</h3>
          <p>{job.company}</p>
          <p>
            {[job.location, job.workArrangement].filter(Boolean).join(' · ')}
          </p>
          <p className="url">{job.sourceUrl}</p>
          <p className="description">
            {job.description || 'No description added.'}
          </p>
          <label>
            FATS workspace
            <select
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
              disabled={busy}
            >
              {FATS_ORIGINS.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <p className="hint">
            Choose the same address used for your existing tracker. The two
            addresses have separate saved data.
          </p>
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setReview(false)}
            >
              Edit details
            </button>
            <button disabled={busy} onClick={() => void handoff()}>
              {busy ? 'Opening…' : 'Open FATS to confirm'}
            </button>
          </div>
        </section>
      )}
      <footer>
        Private draft · expires after 15 minutes once handed off. Extension
        refresh or browser restart clears pending handoffs. Keep the panel open
        while editing; unsent drafts are not backed up.
      </footer>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Sidekick />);
