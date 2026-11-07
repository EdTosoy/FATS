'use client';
import { useState, type FormEvent } from 'react';
import {
  TRACKING_TEXT_FIELDS,
  type ApplicationActivity,
  type JobApplication,
} from '@fats/domain';
import { TRACKING_LABELS } from './job-form-dialog';
import { useApplications } from './application-provider';
import { Button, Card } from './ui';

export function ApplicationTracking({
  application,
}: {
  application: JobApplication;
}) {
  const { update } = useApplications();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError('');
    try {
      await update(application.id, {
        ...application,
        newActivity: {
          kind: String(data.get('kind')) as ApplicationActivity['kind'],
          date: String(data.get('date')),
          notes: String(data.get('activityNotes')),
        },
      });
      form.reset();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Activity could not be saved. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <Card className="tracking-card">
        <h2>Job and application details</h2>
        <dl className="tracking-details">
          {(application.salaryMin != null || application.salaryMax != null) && (
            <div>
              <dt>Salary</dt>
              <dd>
                {application.salaryMin ?? 'Unspecified'} –{' '}
                {application.salaryMax ?? 'Unspecified'} {application.currency}{' '}
                {application.paymentPeriod &&
                  `per ${application.paymentPeriod}`}
              </dd>
            </div>
          )}
          {application.workArrangement && (
            <div>
              <dt>Work arrangement</dt>
              <dd>{application.workArrangement}</dd>
            </div>
          )}
          {TRACKING_TEXT_FIELDS.filter((key) => application[key]).map((key) => (
            <div key={key}>
              <dt>{TRACKING_LABELS[key]}</dt>
              <dd>{application[key]}</dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          Add or update these optional fields with Edit details.
        </p>
      </Card>
      <Card className="tracking-card">
        <h2>Activity timeline</h2>
        <ol className="tracking-timeline">
          {[
            {
              kind: 'milestone',
              date: application.createdAt.slice(0, 10),
              notes: 'Saved in FATS',
            },
            ...(application.activities ?? []),
          ]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((entry, index) => (
              <li key={index}>
                <time>{entry.date}</time> ·{' '}
                {entry.kind === 'recruiter-response'
                  ? 'Recruiter response'
                  : entry.kind === 'status'
                    ? 'Status change'
                    : entry.kind === 'milestone'
                      ? 'Milestone'
                      : 'Note'}
                <p className="tracking-entry-notes">{entry.notes}</p>
              </li>
            ))}
        </ol>
        <form className="job-form" onSubmit={submit}>
          <fieldset disabled={saving}>
            <label>
              Activity type
              <select name="kind">
                <option value="note">Note</option>
                <option value="milestone">Application milestone</option>
                <option value="recruiter-response">Recruiter response</option>
              </select>
            </label>
            <label>
              Activity date
              <input type="date" name="date" required />
            </label>
            <label>
              Activity notes
              <textarea
                name="activityNotes"
                required
                maxLength={20000}
                rows={3}
              />
            </label>
          </fieldset>
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Add activity'}
          </Button>
        </form>
      </Card>
    </>
  );
}
