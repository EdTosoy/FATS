import { ActionLink, Card, PageHeading } from '@/components/ui';

export default function NotFound() {
  return (
    <>
      <PageHeading
        eyebrow="A little detour"
        title="This page isn’t here."
        description="Head back to your workspace to keep going."
      />
      <Card className="content-card">
        <ActionLink href="/">Back to dashboard</ActionLink>
      </Card>
    </>
  );
}
