'use client';

import { Button, Card, PageHeading } from '@/components/ui';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <>
      <PageHeading
        eyebrow="A small hiccup"
        title="This page couldn’t load."
        description="Your saved applications are still in your browser. Try loading this page again."
      />
      <Card className="content-card">
        <Button onClick={reset}>Try again</Button>
      </Card>
    </>
  );
}
