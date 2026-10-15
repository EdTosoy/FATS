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
            Signed-in records belong to your account and are saved on your FATS
            server. When signed out, records stay in this browser at this site
            address. These are separate workspaces. Signing in never uploads
            browser records automatically.
          </p>
          <h3>If saving doesn’t work</h3>
          <p>
            Keep the form open and retry. For account records, check that your
            local FATS server and database are running. If your session ended,
            sign in in a new tab, then return to your form. For browser records,
            allow storage for this site. Failed writes keep the previous data.
          </p>
          <h3>If your saved data can’t be read</h3>
          <p>
            FATS leaves it untouched. Don’t clear site data to fix the error;
            that deletes your applications, interviews, and notes. Ask the
            person maintaining your local FATS setup to back up and inspect the
            data before making changes.
          </p>
          <h3>Keep a backup and recover it</h3>
          <p>
            Open Settings → Data management to export your applications,
            interviews, and notes as JSON. The file is private and unencrypted;
            keep it somewhere safe. To recover it, choose the file, review the
            counts, and explicitly confirm replacement. A full restore replaces
            current records; it does not merge them. Cancel leaves your data
            unchanged. Document files and submitted resume links are excluded.
            JSON replacement is blocked while submitted links exist; use a
            complete operator archive to recover documents.
          </p>
          <p>
            For unreadable browser data, sign out to open local recovery. A
            valid backup can replace it after confirmation. First keep a private
            copy of the original FATS storage value through browser developer
            tools. Without a valid backup, ask the maintainer for recovery help.
          </p>
          <h3>Copy existing browser records to an account</h3>
          <p>
            Sign in, open Settings, and preview the browser transfer. Review
            counts and confirm copying. Existing account records and original
            local records are kept. Identical records are skipped; conflicting
            IDs stop the transfer. Keep a local JSON backup before resolving a
            conflict. If the connection is interrupted, retry the confirmation
            or preview again; completed transfers do not add duplicates.
          </p>
          <ActionLink href="/settings" variant="secondary">
            Open data management
          </ActionLink>
        </Card>
      </div>
      <Card className="content-card guidance-card">
        <div>
          <h2>Keep your interviews together</h2>
          <p>
            After receiving an invitation, open Interviews or schedule from an
            application. Enter the date and time in the organizer’s IANA
            timezone (for example, Asia/Manila). FATS shows that timezone
            everywhere and asks you to choose an occurrence if clocks move back.
          </p>
          <p>
            Save preparation notes before the conversation and reflections
            afterwards. Mark it completed or cancelled yourself; application
            statuses stay independent. This is a personal record: no
            invitations, calendar sync, or reminders are sent.
          </p>
          <ActionLink href="/interviews" variant="secondary">
            Open interviews
          </ActionLink>
        </div>
      </Card>
      <p className="page-footnote">
        Verify your email or recover your password from the sign-in screen.
        Verified accounts can manage private PDF/DOCX files in Resumes.
        Uploading a new version keeps earlier submitted versions unchanged.
      </p>
    </>
  );
}
