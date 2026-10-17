'use client';
import { OfferNextSteps } from './offer-desk';

import {
  ArrowRight,
  BookmarkPlus,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
} from 'lucide-react';
import { InterviewDate, ScheduleInterviewButton } from './interview-list';
import { applicationStatistics, upcomingInterviews } from '@fats/domain';
import { DocumentNextStep } from './application-documents';
import { useAccount } from './account-provider';
import { useApplications } from './application-provider';
import { ApplicationTable } from './application-table';
import { ActionLink, Button, Card, PageHeading, TextLink } from './ui';

export function Dashboard() {
  const account = useAccount();
  const name = account.user?.name.split(' ')[0] || 'Maria';
  const { applications, interviews, now, loading, error, openForm } =
    useApplications();
  const stats = applicationStatistics(applications);
  const saved = applications.find(
    (application) => application.status === 'Saved',
  );
  const upcoming = upcomingInterviews(interviews, now);
  const nearest = upcoming[0];
  const nearestApplication = applications.find(
    (app) => app.id === nearest?.applicationId,
  );
  const inInterview = applications.some(
    (application) => application.status === 'Interview',
  );
  if (loading)
    return (
      <p role="status" className="loading-state">
        Getting your workspace ready…
      </p>
    );
  if (error)
    return (
      <PageHeading
        eyebrow="Your workspace"
        title={`Welcome back, ${name}.`}
        description="Restore access to your saved data to see your dashboard."
      />
    );

  return (
    <>
      <PageHeading
        eyebrow="Your workspace"
        title={`Hello, ${name}.`}
        description="Your saved jobs, conversations, and next steps."
      />
      <Card className="welcome-card" aria-label="Your next step">
        <div className="welcome-content">
          <p className="eyebrow">
            {applications.length === 0
              ? 'Start with an opportunity'
              : 'Pick up where you left off'}
          </p>
          <h2>
            {applications.length === 0
              ? 'Keep the right opportunities close.'
              : nearest
                ? 'A conversation worth preparing for.'
                : saved
                  ? 'A good place to pick up.'
                  : 'Your search, in perspective.'}
          </h2>
          <p className="welcome-description">
            {applications.length === 0
              ? 'Save a job you’re interested in. Keep its details and your next steps in one place.'
              : nearest
                ? `${nearestApplication?.company} · ${nearest.title}. Review your notes and the details before your conversation.`
                : saved
                  ? `Take another look at ${saved.title} at ${saved.company}, then decide on your next step.`
                  : stats.active > 0
                    ? `${stats.active} ${stats.active === 1 ? 'application is' : 'applications are'} in progress. Review what has changed and keep your records up to date.`
                    : 'Your saved applications are ready to review. Keep the details up to date as your plans take shape.'}
          </p>
        </div>
        <div className="welcome-action">
          {applications.length === 0 ? (
            <>
              <Button onClick={() => openForm()}>
                <BookmarkPlus size={17} aria-hidden="true" />
                Save your first job
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
              <span>Saving a job doesn’t apply for it.</span>
            </>
          ) : (
            <ActionLink
              href={
                nearest
                  ? `/interviews/${nearest.id}`
                  : saved
                    ? `/applications/${saved.id}`
                    : '/applications'
              }
            >
              {nearest
                ? 'Open interview preparation'
                : saved
                  ? 'Review saved job'
                  : 'Review applications'}
              <ArrowRight size={16} aria-hidden="true" />
            </ActionLink>
          )}
        </div>
      </Card>
      <div className="stats-grid" aria-label="Application statistics">
        {[
          {
            label: 'Total applications',
            value: stats.total,
            hint: 'Your opportunities, together',
            icon: BriefcaseBusiness,
            color: 'blue',
          },
          {
            label: 'Saved jobs',
            value: stats.saved,
            hint: 'Ready when you are',
            icon: BookmarkPlus,
            color: 'mint',
          },
          {
            label: 'In progress',
            value: stats.active,
            hint: 'Applied, assessment & interview',
            icon: FileCheck2,
            color: 'blue',
          },
          {
            label: 'Offers',
            value: stats.offers,
            hint: 'Something to celebrate',
            icon: CheckCircle2,
            color: 'amber',
          },
        ].map(({ label, value, hint, icon: Icon, color }) => (
          <Card key={label} className="stat-card">
            <span className={`icon-tile ${color}`}>
              <Icon size={21} aria-hidden="true" />
            </span>
            <div>
              <div className="stat-line">
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
              <p>{hint}</p>
            </div>
          </Card>
        ))}
      </div>
      <OfferNextSteps />
      <Card className="interview-card dashboard-interviews">
        <div className="section-heading">
          <h2>
            <CalendarDays size={18} aria-hidden="true" />
            Upcoming interviews
          </h2>
          <TextLink href="/interviews">View</TextLink>
        </div>
        <div className="compact-empty">
          <span className="count-pill" aria-label="Upcoming interview count">
            {upcoming.length} upcoming
          </span>
          {nearest ? (
            <>
              <h3>
                {nearestApplication?.company} · {nearestApplication?.title}
              </h3>
              <p>{nearest.title}</p>
              <p>
                <InterviewDate interview={nearest} />
              </p>
              <TextLink href={`/interviews/${nearest.id}`}>
                View interview details
              </TextLink>
            </>
          ) : (
            <>
              <h3>No scheduled interviews</h3>
              <p>
                {inInterview
                  ? 'An Interview application status does not add a date. Save the details from your invitation here.'
                  : 'A little breathing room. Add an interview when your next invitation arrives.'}
              </p>
              {applications.length > 0 && <ScheduleInterviewButton />}
            </>
          )}
        </div>
      </Card>
      <DocumentNextStep />
      <Card className="recent-card">
        <div className="section-heading">
          <h2>Recent applications</h2>
          <TextLink href="/applications">View all applications</TextLink>
        </div>
        {applications.length > 0 ? (
          <ApplicationTable applications={applications.slice(0, 5)} />
        ) : (
          <div className="recent-empty">
            <BriefcaseBusiness size={20} aria-hidden="true" />
            <p>Your saved jobs will appear here.</p>
          </div>
        )}
      </Card>
    </>
  );
}
