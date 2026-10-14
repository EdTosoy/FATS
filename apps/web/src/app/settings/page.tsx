import type { Metadata } from 'next';
import { LockKeyhole, UserRound } from 'lucide-react';
import { Card, PageHeading, TextLink } from '@/components/ui';

export const metadata: Metadata = { title: 'Settings' };
export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Your space"
        title="Workspace settings"
        description="A simple local workspace while FATS takes its first steps."
      />
      <div className="settings-grid">
        <Card className="content-card">
          <span className="icon-tile blue">
            <UserRound size={23} aria-hidden="true" />
          </span>
          <h2>Meet your demo profile</h2>
          <p>
            The greeting uses Maria Santos as a sample profile. Your application
            list starts empty and contains only the jobs you save.
          </p>
          <p className="muted">
            Accounts and profile editing will arrive in a later phase.
          </p>
        </Card>
        <Card className="content-card">
          <span className="icon-tile mint">
            <LockKeyhole size={23} aria-hidden="true" />
          </span>
          <h2>Saved in this browser</h2>
          <p>
            Your jobs stay on this device, in this browser, for this site
            address. They aren’t synced to an account or another device.
          </p>
          <p className="muted">
            Clearing site data will remove your applications. Private browsing
            may clear them when you close the window.
          </p>
          <TextLink href="/help">Read about your local workspace</TextLink>
        </Card>
      </div>
    </>
  );
}
