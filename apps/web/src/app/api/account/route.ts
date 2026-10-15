import { getServices } from '@/server/services';
import { handleAuth } from '@/server/handlers';
import { errorResponse, privateHeaders } from '@/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (
    !process.env.DATABASE_URL ||
    !process.env.BETTER_AUTH_URL ||
    !process.env.BETTER_AUTH_SECRET
  )
    return Response.json(
      { user: null, configured: false },
      { headers: privateHeaders },
    );
  try {
    return await handleAuth(
      new Request(new URL('/api/auth/get-session', request.url), {
        headers: request.headers,
      }),
      getServices(),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
