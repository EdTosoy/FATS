'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, Pencil } from 'lucide-react';
import type { InterviewStatus } from '@fats/domain';
import { useApplications } from './application-provider';
import { InterviewFormDialog } from './interview-form-dialog';
import { InterviewDate, InterviewStatusBadge } from './interview-list';
import { ActionLink, Button, Card, PageHeading } from './ui';

export function InterviewDetail({ id }: { id: string }) {
  const {
    interviews,
    applications,
    loading,
    error: storageError,
    updateInterview,
  } = useApplications();
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const interview = interviews.find((i) => i.id === id);
  const application = applications.find(
    (app) => app.id === interview?.applicationId,
  );
  if (loading)
    return (
      <p role="status" className="loading-state">
        Loading interview…
      </p>
    );
  if (storageError)
    return (
      <PageHeading
        eyebrow="Interview details"
        title="Your interview is unavailable."
        description="Follow the recovery guidance above, then refresh."
      />
    );
  if (!interview || !application)
    return (
      <>
        <PageHeading
          eyebrow="Interview details"
          title="We couldn’t find this interview."
          description="It may belong to another browser or workspace."
        />
        <ActionLink href="/interviews" variant="secondary">
          Back to interviews
        </ActionLink>
      </>
    );
  async function save(
    input: Parameters<typeof updateInterview>[1],
    feedback: string,
  ) {
    if (!interview) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await updateInterview(interview.id, input);
      setMessage(feedback);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Your changes could not be saved. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }
  function changeStatus(status: InterviewStatus) {
    if (interview) void save({ ...interview, status }, `Interview ${status}.`);
  }
  function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interview) return;
    const data = new FormData(event.currentTarget);
    void save(
      {
        ...interview,
        preparationNotes: String(data.get('preparationNotes') ?? ''),
        reflections: String(data.get('reflections') ?? ''),
      },
      'Your notes are saved.',
    );
  }
  return (
    <>
      <Link className="back-link" href="/interviews">
        <ArrowLeft size={16} aria-hidden="true" />
        Back to interviews
      </Link>
      <PageHeading
        eyebrow={`${interview.stage} interview`}
        title={interview.title}
        description={`${application.company} · ${application.title}`}
        action={
          <Button
            variant="secondary"
            disabled={saving}
            onClick={(e) => setOpener(e.currentTarget)}
          >
            <Pencil size={16} aria-hidden="true" />
            Edit / reschedule
          </Button>
        }
      />
      <div className="detail-grid interview-detail-grid">
        <div>
          <Card className="detail-overview interview-overview">
            <div className="interview-detail-heading">
              <span className="icon-tile blue">
                <CalendarDays size={23} aria-hidden="true" />
              </span>
              <h2>Your conversation</h2>
              <InterviewStatusBadge status={interview.status} />
            </div>
            <p className="interview-time">
              <InterviewDate interview={interview} />
            </p>
            {interview.meetingUrl && (
              <a
                className="text-link meeting-link"
                href={interview.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open meeting link ↗
              </a>
            )}
            {interview.location && (
              <p className="interview-location">
                Location: {interview.location}
              </p>
            )}
            <p className="field-hint">
              Check the invitation if the organizer changes the meeting. FATS
              does not sync with a calendar.
            </p>
          </Card>
          <Card className="content-card">
            <h2>A little preparation. A little reflection.</h2>
            <p>
              Keep what helps you feel ready, then capture what you learned.
              Your notes stay in this browser.
            </p>
            <form
              key={JSON.stringify([
                interview.preparationNotes,
                interview.reflections,
              ])}
              className="job-form"
              onSubmit={saveNotes}
            >
              <fieldset disabled={saving}>
                <label>
                  <span id="preparation-label">Preparation notes</span>
                  <textarea
                    name="preparationNotes"
                    defaultValue={interview.preparationNotes}
                    rows={7}
                    maxLength={20000}
                    aria-labelledby="preparation-label"
                    aria-describedby="preparation-hint"
                    placeholder="Questions I expect…&#10;Topics to prepare…&#10;Questions I want to ask…"
                  />
                  <span id="preparation-hint" className="field-hint">
                    Questions you expect, topics to prepare, and personal
                    reminders.
                  </span>
                </label>
                <label>
                  <span id="reflections-label">Post-interview reflections</span>
                  <textarea
                    name="reflections"
                    defaultValue={interview.reflections}
                    rows={7}
                    maxLength={20000}
                    aria-labelledby="reflections-label"
                    aria-describedby="reflections-hint"
                    placeholder="Questions I was asked…&#10;What went well…&#10;What I want to improve…"
                  />
                  <span id="reflections-hint" className="field-hint">
                    Questions asked, what went well, and what you want to
                    improve.
                  </span>
                </label>
              </fieldset>
              <div className="form-footer">
                <span className="field-hint">
                  Plain text · private to this browser
                </span>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save notes'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
        <div>
          <Card className="progress-card">
            <h2>Your next step</h2>
            <p className="muted">
              {interview.status === 'scheduled'
                ? 'Before the conversation, review your notes. Afterwards, mark it completed and reflect.'
                : interview.status === 'completed'
                  ? 'Take a moment to record what you learned.'
                  : 'Keep this record for your history. You can schedule it again if plans change.'}
            </p>
            <div className="interview-actions">
              {interview.status !== 'completed' && (
                <Button
                  disabled={saving}
                  onClick={() => changeStatus('completed')}
                >
                  Mark completed
                </Button>
              )}
              {interview.status === 'scheduled' && (
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => changeStatus('cancelled')}
                >
                  Cancel interview
                </Button>
              )}
              {interview.status !== 'scheduled' && (
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => changeStatus('scheduled')}
                >
                  Mark scheduled
                </Button>
              )}
            </div>
            <p className="field-hint">
              These actions leave the application status unchanged. Use Edit /
              reschedule to change the date and time.
            </p>
            <hr />
            <Link
              className="text-link"
              href={`/applications/${application.id}`}
            >
              View related application →
            </Link>
          </Card>
        </div>
      </div>
      <div className="save-feedback" role="status">
        {saving ? 'Saving changes…' : message}
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {opener && (
        <InterviewFormDialog
          interview={interview}
          opener={opener}
          onClose={() => setOpener(null)}
          onSaved={() => setMessage('Interview details saved.')}
        />
      )}
    </>
  );
}
