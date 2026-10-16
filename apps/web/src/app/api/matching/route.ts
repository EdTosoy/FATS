import { handleMatching } from '@/server/matching-handlers';
import { getServices } from '@/server/services';
import { errorResponse } from '@/server/http';
import {
  isMatchingEnabled,
  matchingDisabledResponse,
} from '@/server/matching-access';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  if (!isMatchingEnabled()) return matchingDisabledResponse();
  try {
    return await handleMatching(request, getServices());
  } catch (error) {
    return errorResponse(error);
  }
}
export { handle as GET, handle as POST };
