import type { Metadata } from 'next';
import { ArrowRight, BookOpen, Compass, LockKeyhole } from 'lucide-react';
import { ActionLink, Card, PageHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Help & guidance' };
export default function HelpPage() {
  return (
    <>
      <PageHeading
        eyebrow="You don’t have to figure it out alone"
        title="A little guidance"
        description="A few simple answers to help you find your feet."
      />
      <Card className="content-card help-intro">
        <span className="icon-tile mint">
          <Compass size={25} aria-hidden="true" />
        </span>
        <div>
          <h2>Find it elsewhere. Keep it together here.</h2>
          <p>
            FATS is your personal job-search companion. Explore external job
            websites and company careers pages, then save opportunities here.
            Employers don’t post jobs in FATS.
          </p>
          <ActionLink href="/applications" variant="secondary">
            Open your applications
            <ArrowRight size={15} aria-hidden="true" />
          </ActionLink>
        </div>
      </Card>
      <div className="settings-grid">
        <Card className="content-card">
          <span className="icon-tile blue">
            <BookOpen size={23} aria-hidden="true" />
          </span>
          <h2>Your first three steps</h2>
          <ol className="help-steps">
            <li>
              <strong>Save a job.</strong> Add the title, company, location, and
              original link. A description is optional.
            </li>
            <li>
              <strong>Apply on the original website.</strong> Saving a job in
              FATS doesn’t submit an application.
            </li>
            <li>
              <strong>Update your status.</strong> Open the saved job and choose
              Applied, Assessment, Interview, Offer, Rejected, or Withdrawn as
              your search progresses.
            </li>
          </ol>
        </Card>
        <Card className="content-card">
          <span className="icon-tile mint">
            <LockKeyhole size={23} aria-hidden="true" />
          </span>
          <h2>Taking care of your saved data</h2>
          <p>
            Your applications are saved only in this browser. Use the same
            browser and site address to find them again.
          </p>
          <h3>If saving doesn’t work</h3>
          <p>
            Keep the form open, allow storage for this site in your browser
            settings, and try again. Your previous saved data is kept if a
            change can’t be written.
          </p>
          <h3>If your saved data can’t be read</h3>
          <p>
            FATS leaves it untouched. Don’t clear site data to fix the error;
            that deletes your applications. Ask the person maintaining your
            local FATS setup to back up and inspect the data before making
            changes.
          </p>
        </Card>
      </div>
      <p className="page-footnote">
        Resume uploads, interview scheduling, accounts, and device sync are
        planned. They aren’t available in this version.
      </p>
    </>
  );
}
