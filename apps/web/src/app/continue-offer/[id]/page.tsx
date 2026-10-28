import type { Metadata } from 'next';
import { OfferContinuation } from '@/components/offer-continuation';
import {
  offerContinuationId,
  offerContinuationPath,
} from '@/lib/offer-continuation';
export const metadata: Metadata = {
  title: 'Continue to Offer Desk',
  referrer: 'no-referrer',
};
export default async function ContinueOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OfferContinuation
      applicationId={offerContinuationId(offerContinuationPath(id))}
    />
  );
}
