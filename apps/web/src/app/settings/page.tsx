import type { Metadata } from 'next';
import { PageHeading } from '@/components/ui';
import { AccountSettings } from '@/components/account-settings';
import { AppearanceSettings } from '@/components/appearance-settings';
import { DataManagement } from '@/components/data-management';

export const metadata: Metadata = { title: 'Settings' };
export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Your space"
        title="Workspace settings"
        description="Your account, browser records, and recovery options."
      />
      <AppearanceSettings />
      <AccountSettings />
      <DataManagement />
    </>
  );
}
