import { handleOffers } from '@/server/offer-handlers';
import { getServices } from '@/server/services';
import { errorResponse } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  try {
    return await handleOffers(request, getServices());
  } catch (error) {
    return errorResponse(error);
  }
}
export { handle as GET, handle as POST };
