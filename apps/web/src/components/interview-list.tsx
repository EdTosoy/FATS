'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import {
  interviewGroup,
  type Interview,
  type InterviewGroup,
} from '@fats/domain';
import { useApplications } from './application-provider';
import { InterviewFormDialog } from './interview-form-dialog';
import { ActionLink, Button, Card, EmptyState, PageHeading } from './ui';

export function InterviewDate({ interview }: { interview: Interview }) {
  return (
    <time dateTime={interview.scheduledAt}>
      {new Intl.DateTimeFormat('en-PH', {
        timeZone: interview.timeZone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(interview.scheduledAt))}{' '}
      · {interview.timeZone}
    </time>
  );
}
export function InterviewStatusBadge({
  status,
}: {
  status: Interview['status'];
}) {
  return (
    <span
      className={`status status-${status === 'scheduled' ? 'interview' : status === 'completed' ? 'offer' : 'withdrawn'}`}
    >
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
export function InterviewRows({ interviews }: { interviews: Interview[] }) {
  const { applications, now } = useApplications();
  return (
    <ul className="interview-rows">
      {interviews.map((interview) => {
        const app = applications.find(
          (app) => app.id === interview.applicationId,
        );
        return (
          <li key={interview.id}>
            <span className="icon-tile blue">
              <CalendarDays size={20} aria-hidden="true" />
            </span>
            <div className="interview-summary">
              <Link className="role-link" href={`/interviews/${interview.id}`}>
                {interview.title}
              </Link>
              <p>
                {app?.company} · {app?.title} · {interview.stage}
              </p>
              <InterviewDate interview={interview} />
              {interview.status === 'scheduled' &&
                interviewGroup(interview, now) === 'Past & completed' && (
                  <p className="field-hint">
                    Time has passed · add a reflection or update the status.
                  </p>
                )}
            </div>
            <InterviewStatusBadge status={interview.status} />
          </li>
        );
      })}
    </ul>
  );
}
export function ScheduleInterviewButton({
  applicationId,
  label = 'Add interview',
}: {
  applicationId?: string;
  label?: string;
}) {
  const { applications, loading, error } = useApplications();
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        disabled={loading || !!error || !applications.length}
        onClick={(event) => setOpener(event.currentTarget)}
      >
        <Plus size={16} aria-hidden="true" />
        {label}
      </Button>
      {opener && (
        <InterviewFormDialog
          applicationId={applicationId}
          opener={opener}
          onClose={() => setOpener(null)}
        />
      )}
    </>
  );
}
export function ApplicationInterviews({
  applicationId,
}: {
  applicationId: string;
}) {
  const { interviews } = useApplications();
  const linked = interviews.filter((i) => i.applicationId === applicationId);
  return (
    <Card className="application-interviews">
      <div className="section-heading">
        <h2>Interviews</h2>
        <ScheduleInterviewButton
          applicationId={applicationId}
          label="Schedule interview"
        />
      </div>
      {linked.length ? (
        <InterviewRows interviews={linked} />
      ) : (
        <div className="description-empty">
          <p>No interviews linked yet.</p>
          <span>
            Received an invitation? Save its time and your preparation notes
            here.
          </span>
        </div>
      )}
    </Card>
  );
}
export function InterviewList() {
  const { interviews, applications, loading, error, now } = useApplications();
  const [group, setGroup] = useState<InterviewGroup | 'All'>('Upcoming');
  const [applicationId, setApplicationId] = useState('All');
  const [query, setQuery] = useState('');
  if (loading)
    return (
      <p role="status" className="loading-state">
        Loading interviews…
      </p>
    );
  if (error)
    return (
      <PageHeading
        eyebrow="Your conversations"
        title="Your interviews are unavailable."
        description="Follow the recovery guidance above, then refresh."
      />
    );
  const visible = interviews
    .filter((i) => {
      const app = applications.find((app) => app.id === i.applicationId);
      return (
        (group === 'All' || interviewGroup(i, now) === group) &&
        (applicationId === 'All' || i.applicationId === applicationId) &&
        [i.title, i.stage, app?.title, app?.company].some((value) =>
          value?.toLowerCase().includes(query.trim().toLowerCase()),
        )
      );
    })
    .sort((a, b) =>
      group === 'Past & completed'
        ? b.scheduledAt.localeCompare(a.scheduledAt)
        : a.scheduledAt.localeCompare(b.scheduledAt),
    );
  return (
    <>
      <PageHeading
        eyebrow="A chance to connect"
        title="Your interviews"
        description="Prepare for the next conversation. Learn from the last one."
        action={applications.length ? <ScheduleInterviewButton /> : undefined}
      />
      <Card>
        <div className="tracker-heading">
          <div>
            <h2>One conversation at a time</h2>
            <p>Your application status stays yours to choose.</p>
          </div>
          <span className="count-pill">{interviews.length} interviews</span>
        </div>
        {interviews.length > 0 && (
          <div className="tracker-controls interview-filters">
            <label className="search-field">
              <span className="sr-only">Search interviews</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search company, role, or interview"
              />
            </label>
            <label className="filter-field">
              <span className="sr-only">Filter interviews</span>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as typeof group)}
              >
                {['Upcoming', 'Past & completed', 'Cancelled', 'All'].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label className="filter-field">
              <span className="sr-only">Filter by application</span>
              <select
                value={applicationId}
                onChange={(e) => setApplicationId(e.target.value)}
              >
                <option value="All">All applications</option>
                {applications.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.company} · {app.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {visible.length ? (
          <InterviewRows interviews={visible} />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={
              interviews.length
                ? 'No interviews in this view.'
                : 'No scheduled interviews.'
            }
            action={
              !applications.length ? (
                <ActionLink href="/applications" variant="secondary">
                  Save an application first
                </ActionLink>
              ) : interviews.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setGroup('All');
                    setApplicationId('All');
                    setQuery('');
                  }}
                >
                  Show all interviews
                </Button>
              ) : (
                <ScheduleInterviewButton />
              )
            }
          >
            <p>
              {!applications.length
                ? 'Start with a saved job, then link an interview when you receive an invitation.'
                : interviews.length
                  ? 'Try another filter, or add your next conversation.'
                  : 'Have an invitation? Add the time, meeting details, and a few notes to prepare.'}
            </p>
          </EmptyState>
        )}
        <div className="tracker-footer" role="status">
          Showing {visible.length} of {interviews.length} interviews · stored in
          this browser
        </div>
      </Card>
      <p className="page-footnote">
        Times use each interview’s timezone. Past scheduled interviews stay
        scheduled until you mark them completed or cancelled.
      </p>
    </>
  );
}
