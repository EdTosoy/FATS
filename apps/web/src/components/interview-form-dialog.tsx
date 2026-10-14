'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, X } from 'lucide-react';
import {
  INTERVIEW_STAGES,
  localDateTime,
  resolveInterviewTime,
  type Interview,
  type InterviewStage,
} from '@fats/domain';
import { useApplications } from './application-provider';
import { Button } from './ui';

export function InterviewFormDialog({
  interview,
  applicationId,
  opener,
  onClose,
  onSaved,
}: {
  interview?: Interview;
  applicationId?: string;
  opener: HTMLElement | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { applications, createInterview, updateInterview } = useApplications();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [repeated, setRepeated] = useState(false);
  const initial = interview
    ? localDateTime(interview.scheduledAt, interview.timeZone)
    : { date: '', time: '' };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const get = (key: string) => String(data.get(key) ?? '');
    setError('');
    setSaving(true);
    try {
      const timeZone = get('timeZone').trim();
      // Preserve an unchanged instant, including its repeated-time occurrence.
      const scheduledAt =
        interview &&
        get('date') === initial.date &&
        get('time') === initial.time &&
        timeZone === interview.timeZone
          ? interview.scheduledAt
          : resolveInterviewTime(
              get('date'),
              get('time'),
              timeZone,
              get('occurrence') === 'earlier'
                ? 'earlier'
                : get('occurrence') === 'later'
                  ? 'later'
                  : undefined,
            );
      const input = {
        applicationId: get('applicationId'),
        title: get('title'),
        stage: get('stage') as InterviewStage,
        scheduledAt,
        timeZone,
        meetingUrl: get('meetingUrl'),
        location: get('location'),
        preparationNotes: get('preparationNotes'),
        reflections: interview?.reflections ?? '',
      };
      if (interview)
        await updateInterview(interview.id, {
          ...input,
          status: interview.status,
        });
      else {
        const saved = await createInterview(input);
        router.push(`/interviews/${saved.id}`);
      }
      onSaved?.();
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Your interview could not be saved. Try again.';
      setError(message);
      setRepeated(message.includes('occurs twice'));
      setSaving(false);
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener?.isConnected) opener.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <div className="dialog-heading">
            <span className="icon-tile mint">
              <CalendarDays size={22} aria-hidden="true" />
            </span>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="icon-button"
                aria-label="Close form"
                disabled={saving}
              >
                <X size={20} />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Title className="dialog-title">
            {interview ? 'Edit interview' : 'Add interview'}
          </Dialog.Title>
          <Dialog.Description className="muted">
            Keep your next conversation in view. This saves a personal record;
            it does not invite anyone or change your application status.
          </Dialog.Description>
          <form className="job-form" onSubmit={submit}>
            <fieldset disabled={saving}>
              <label>
                Application (required)
                <select
                  name="applicationId"
                  required
                  defaultValue={interview?.applicationId ?? applicationId ?? ''}
                >
                  <option value="" disabled>
                    Choose a saved application
                  </option>
                  {applications.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.company} · {app.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Interview title (required)
                  <input
                    name="title"
                    required
                    maxLength={160}
                    defaultValue={interview?.title}
                    placeholder="e.g. Meet the engineering team"
                  />
                </label>
                <label>
                  <span id="interview-stage-label">Interview stage</span>
                  <select
                    name="stage"
                    defaultValue={interview?.stage ?? 'HR'}
                    aria-labelledby="interview-stage-label"
                    aria-describedby="interview-stage-hint"
                  >
                    {INTERVIEW_STAGES.map((stage) => (
                      <option key={stage}>{stage}</option>
                    ))}
                  </select>
                  <span id="interview-stage-hint" className="field-hint">
                    Choose Custom and use the title to describe your stage.
                  </span>
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Date (required)
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={initial.date}
                    onChange={() => setRepeated(false)}
                  />
                </label>
                <label>
                  Time (required)
                  <input
                    name="time"
                    type="time"
                    required
                    defaultValue={initial.time}
                    onChange={() => setRepeated(false)}
                  />
                </label>
              </div>
              <label>
                <span id="interview-timezone-label">Timezone (required)</span>
                <input
                  name="timeZone"
                  required
                  defaultValue={interview?.timeZone ?? 'Asia/Manila'}
                  list="interview-timezones"
                  aria-describedby="timezone-hint"
                  aria-labelledby="interview-timezone-label"
                  onChange={() => setRepeated(false)}
                />
                <datalist id="interview-timezones">
                  {[
                    'Asia/Manila',
                    'Asia/Singapore',
                    'Asia/Tokyo',
                    'America/New_York',
                    'America/Los_Angeles',
                    'Europe/London',
                    'Australia/Sydney',
                    'UTC',
                  ].map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
                <span id="timezone-hint" className="field-hint">
                  Date and time are in this timezone. You can enter any IANA
                  timezone.
                </span>
              </label>
              {repeated && (
                <label>
                  Repeated time occurrence
                  <select name="occurrence" required defaultValue="">
                    <option value="" disabled>
                      Choose which occurrence
                    </option>
                    <option value="earlier">
                      First occurrence (before clocks move back)
                    </option>
                    <option value="later">
                      Second occurrence (after clocks move back)
                    </option>
                  </select>
                </label>
              )}
              <label>
                <span id="interview-meeting-label">Meeting URL</span>
                <input
                  name="meetingUrl"
                  type="url"
                  maxLength={2048}
                  defaultValue={interview?.meetingUrl}
                  placeholder="https://…"
                  aria-labelledby="interview-meeting-label"
                  aria-describedby="interview-meeting-hint"
                />
                <span id="interview-meeting-hint" className="field-hint">
                  Add a meeting URL or a physical location below.
                </span>
              </label>
              <label>
                Physical location
                <input
                  name="location"
                  maxLength={500}
                  defaultValue={interview?.location}
                  placeholder="e.g. Office address, floor, and room"
                />
              </label>
              <label>
                Preparation notes (optional)
                <textarea
                  name="preparationNotes"
                  rows={4}
                  maxLength={20000}
                  defaultValue={interview?.preparationNotes}
                  placeholder="Questions you expect, topics to prepare, and questions you want to ask."
                />
              </label>
            </fieldset>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
            <div className="form-footer">
              <span className="field-hint">
                Private to this browser. No reminders are sent.
              </span>
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving
                    ? 'Saving…'
                    : interview
                      ? 'Save changes'
                      : 'Save interview'}
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
