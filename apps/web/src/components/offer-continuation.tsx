'use client';
import { offerContinuationPath } from '@/lib/offer-continuation';
import { useAccount } from './account-provider';
import { LocalDataMigration } from './local-data-migration';
import { ActionLink, PageHeading } from './ui';
export function OfferContinuation({
  applicationId,
}: {
  applicationId: string | null;
}) {
  const account = useAccount();
  return (
    <>
      <PageHeading
        eyebrow="Your FATS account"
        title="Continue to Offer Desk"
        description="Review a copy of your browser work before opening Offer Desk."
      />
      {!applicationId ? (
        <>
          <p>
            This continuation link is unavailable. Your saved records have not
            changed.
          </p>
          <ActionLink href="/applications">Open applications</ActionLink>
        </>
      ) : !account.user ? (
        <>
          <p>
            Offer Desk needs an account for private offer terms and letter
            versions. Sign in, then preview a copy of your browser applications
            and interviews. Nothing is copied without your confirmation.
          </p>
          <ActionLink
            href={
              '/sign-in?next=' +
              encodeURIComponent(offerContinuationPath(applicationId))
            }
          >
            Sign in for Offer Desk
          </ActionLink>
        </>
      ) : (
        <LocalDataMigration
          key={account.user.id}
          continuationApplicationId={applicationId}
        />
      )}
    </>
  );
}
