import type { Metadata } from 'next';
import { CalendarDays, Check, ArrowRight } from 'lucide-react';
import { ActionLink, Card, EmptyState, PageHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'Interviews' };
export default function InterviewsPage() {
  return (
    <>
      <PageHeading
        eyebrow="A chance to connect"
        title="Your interviews"
        description="Get ready to share your story, one conversation at a time."
      />
      <Card>
        <EmptyState icon={CalendarDays} title="No scheduled interviews.">
          <p>
            Interview scheduling and preparation tools are coming later.
            <br />
            You can already mark an application as Interview in your tracker;
            this does not schedule a meeting.
          </p>
        </EmptyState>
      </Card>
      <Card className="guidance-card">
        <span className="icon-tile mint">
          <CalendarDays size={23} aria-hidden="true" />
        </span>
        <div>
          <h2>You can take a small step to prepare.</h2>
          <p>
            Use your calendar for interview times while we build this space.
          </p>
          <ul className="tip-list">
            <li>
              <Check size={16} aria-hidden="true" />
              Read the role’s requirements again.
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              Practice a short introduction.
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              Prepare a few questions about the team.
            </li>
          </ul>
          <ActionLink href="/applications" variant="secondary">
            Open your application tracker
            <ArrowRight size={15} aria-hidden="true" />
          </ActionLink>
        </div>
      </Card>
    </>
  );
}
