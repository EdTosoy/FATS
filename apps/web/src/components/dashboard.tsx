'use client';

import {
  ArrowRight,
  BookmarkPlus,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  Compass,
  FileCheck2,
  Sparkles,
  Sprout,
} from 'lucide-react';
import { applicationStatistics } from '@fats/domain';
import { useApplications } from './application-provider';
import { ApplicationTable } from './application-table';
import {
  ActionLink,
  Button,
  Card,
  EmptyState,
  PageHeading,
  TextLink,
} from './ui';

export function Dashboard() {
  const { applications, loading, error, openForm } = useApplications();
  const stats = applicationStatistics(applications);
  const saved = applications.find(
    (application) => application.status === 'Saved',
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
        title="Welcome back, Maria."
        description="Restore access to your saved data to see your dashboard."
      />
    );

  return (
    <>
      <PageHeading
        eyebrow="A little progress, every day"
        title="Hello, Maria."
        description="Your job search, a little more organized. You’ve got this."
        action={
          <span className="greeting-note">
            <span className="avatar">M</span>
            <span>
              Your next chapter
              <br />
              <strong>starts with a small step.</strong>
            </span>
          </span>
        }
      />
      {applications.length === 0 && (
        <Card className="welcome-card">
          <div className="welcome-copy">
            <span className="pill">
              <Sparkles size={14} aria-hidden="true" />A fresh start
            </span>
            <h2>
              Your first opportunity
              <br />
              starts here.
            </h2>
            <p>
              You don’t need to have it all figured out. Save one job that
              interests you, and we’ll help you keep track of what comes next.
            </p>
            <Button onClick={() => openForm()}>
              <BookmarkPlus size={17} aria-hidden="true" />
              Save your first job
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <span className="welcome-footnote">
              No lengthy setup. Just your next step.
            </span>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <div className="art-sun" />
            <div className="art-cloud cloud-one" />
            <div className="art-cloud cloud-two" />
            <div className="art-building building-one" />
            <div className="art-building building-two" />
            <div className="art-building building-three" />
            <div className="art-ground" />
            <div className="art-path" />
            <div className="art-plant">
              <Sprout size={112} strokeWidth={1.3} />
            </div>
            <span className="art-caption">Room to grow.</span>
            <div className="floating-note">
              <span className="icon-tile mint">
                <Check size={19} />
              </span>
              <span>
                One small step.
                <br />
                <strong>A new beginning.</strong>
              </span>
            </div>
          </div>
        </Card>
      )}
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
      <div className="dashboard-middle">
        <Card className="next-step-card">
          <div className="section-heading">
            <h2>
              <Compass size={18} aria-hidden="true" />
              Your next step
            </h2>
            <span className="pill mint-pill">At your own pace</span>
          </div>
          <div className="next-step-body">
            <span className="icon-tile mint large">
              <Sprout size={30} aria-hidden="true" />
            </span>
            <div>
              <h3>
                {saved
                  ? `Take another look at ${saved.company}.`
                  : applications.length === 0
                    ? 'Find a role that feels like you.'
                    : inInterview
                      ? 'Make a little room to prepare.'
                      : 'Keep your progress up to date.'}
              </h3>
              <p>
                {saved
                  ? 'Review the requirements, tailor your resume, and apply on the original website when you’re ready.'
                  : applications.length === 0
                    ? 'Look on a job website or company careers page. Save the link here so you can come back to it.'
                    : inInterview
                      ? 'Review the job description and practice introducing yourself. Scheduling and preparation tools are coming later.'
                      : 'Applied on the company’s website? Update your status here so your workspace stays in sync.'}
              </p>
              {saved ? (
                <TextLink href={`/applications/${saved.id}`}>
                  Review saved job
                </TextLink>
              ) : applications.length === 0 ? (
                <Button variant="ghost" onClick={() => openForm()}>
                  Save a job
                  <ArrowRight size={15} aria-hidden="true" />
                </Button>
              ) : (
                <TextLink href="/applications">Review applications</TextLink>
              )}
            </div>
          </div>
        </Card>
        <Card className="interview-card">
          <div className="section-heading">
            <h2>
              <CalendarDays size={18} aria-hidden="true" />
              Upcoming interviews
            </h2>
            <TextLink href="/interviews">View</TextLink>
          </div>
          <div className="compact-empty">
            <span className="icon-tile neutral">
              <CalendarDays size={23} aria-hidden="true" />
            </span>
            <h3>No scheduled interviews</h3>
            <p>
              {inInterview
                ? 'You have an application in Interview. A status alone doesn’t add a date; scheduling will arrive in a later phase.'
                : 'A little breathing room. Interview scheduling will arrive in a later phase.'}
            </p>
          </div>
        </Card>
      </div>
      <Card className="recent-card">
        <div className="section-heading">
          <h2>Recent applications</h2>
          <TextLink href="/applications">View all applications</TextLink>
        </div>
        {applications.length > 0 ? (
          <ApplicationTable applications={applications.slice(0, 5)} />
        ) : (
          <EmptyState
            icon={BriefcaseBusiness}
            title="Your story starts with one application."
            action={
              <Button variant="secondary" onClick={() => openForm()}>
                <BookmarkPlus size={16} aria-hidden="true" />
                Save a job
              </Button>
            }
          >
            <p>
              When you save a job, it’ll appear here.
              <br />A small step today is still a step forward.
            </p>
          </EmptyState>
        )}
      </Card>
      {applications.length === 0 && (
        <div className="first-steps">
          <div>
            <span>01</span>
            <div>
              <strong>Find an opportunity</strong>
              <p>Use your favorite job site.</p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <strong>Save it here</strong>
              <p>Keep the link and details together.</p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <strong>Track your progress</strong>
              <p>Update your status as you go.</p>
            </div>
          </div>
        </div>
      )}
      <div className="dashboard-tip">
        <Sparkles size={17} aria-hidden="true" />
        <p>
          A friendly reminder: you don’t need to match every requirement to give
          yourself a chance.
        </p>
        <ActionLink href="/help" variant="ghost">
          A little guidance
          <ArrowRight size={14} aria-hidden="true" />
        </ActionLink>
      </div>
    </>
  );
}
