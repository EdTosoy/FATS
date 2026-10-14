import type { Metadata } from 'next';
import { FileText, Check, ArrowRight } from 'lucide-react';
import { ActionLink, Card, EmptyState, PageHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Resumes' };
export default function ResumesPage() {
  return (
    <>
      <PageHeading
        eyebrow="Tell your story"
        title="Your resumes"
        description="A space for the experience, projects, and skills that make you, you."
      />
      <Card>
        <EmptyState icon={FileText} title="Your resume library is on the way.">
          <p>
            File uploads and resume versions aren’t available yet.
            <br />
            For now, keep your documents on your device and tailor a copy for
            each role.
          </p>
        </EmptyState>
      </Card>
      <Card className="guidance-card">
        <span className="icon-tile amber">
          <FileText size={23} aria-hidden="true" />
        </span>
        <div>
          <h2>A little preparation goes a long way.</h2>
          <p>
            You can start with a simple resume. Your school projects and
            internships count, too.
          </p>
          <ul className="tip-list">
            <li>
              <Check size={16} aria-hidden="true" />
              Highlight two or three relevant projects.
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              Describe what you did and the result.
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              Keep a clear PDF copy ready to share.
            </li>
          </ul>
          <ActionLink href="/applications" variant="secondary">
            Review your saved roles
            <ArrowRight size={15} aria-hidden="true" />
          </ActionLink>
        </div>
      </Card>
    </>
  );
}
