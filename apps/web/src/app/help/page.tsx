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
      <Card className="content-card guidance-card" id="sidekick-guidance">
        <div>
          <h2>Save a listing with Sidekick</h2>
          <p>
            On desktop Chrome, open the installed FATS Sidekick extension on a
            job listing. Choose Capture Job, check the details, then open FATS
            and confirm the save. You can correct anything before saving.
            Capturing never applies for a job.
          </p>
          <p>
            Keep the same FATS site address and sign in before confirming if you
            want account storage. A handoff expires after 15 minutes; capture
            again if it expires. Without the extension, use Save a job and paste
            the details. Ask the person maintaining your local setup to install
            Sidekick; mobile capture is not supported.
          </p>
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
            interviews, notes, offer history, and Career Vault records as JSON.
            The file is private and unencrypted; keep it somewhere safe. To
            recover it, choose the file, review the preview, and explicitly
            confirm. Backups with offer or Career Vault history add missing
            records and skip identical ones; conflicts stop the import. Version
            1 backups replace applications and interviews after confirmation.
            Replacement is blocked while protected history or submitted links
            exist. Cancel leaves your data unchanged.
          </p>
          <p>
            JSON does not contain document files or submitted resume links.
            Imported offer letters and Career Vault attachments are historical
            references, not downloadable documents. Review unavailable files in
            the preview. Recovering files and their links requires a complete
            operator archive with matching private files.
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
      <Card className="content-card guidance-card">
        <div>
          <h2>From an offer to your first job</h2>
          <p>
            Move an application to Offer, then open its Offer Desk to record
            terms, compare revisions, and keep questions for HR. Recording
            acceptance keeps your history; communicate your decision directly
            with the employer.
          </p>
          <p>
            When you’re ready, add employment in Career Vault and use the
            accepted offer to fill available details. It starts as Not started.
            Confirm Current and your actual start date yourself. Track only the
            document requirements your employer gives you; Received can mean a
            paper copy, without a file stored in FATS.
          </p>
          <ActionLink href="/career-vault" variant="secondary">
            Open Career Vault
          </ActionLink>
        </div>
      </Card>
      <p className="page-footnote">
        Verify your email or recover your password from the sign-in screen.
        Verified accounts can manage private PDF/DOCX files in Resumes. New
        uploads require operational safety scanning; unavailable checks block
        uploads. Accepted versions keep earlier submitted versions unchanged.
        PDF Tools opens a local copy in your browser and downloads your edits
        without saving it to your library or Career Vault.
      </p>
    </>
  );
}
