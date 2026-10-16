import { privateHeaders } from './http';

// Server-only opt-in. Provider credentials alone must never expose Phase 6.
export function isMatchingEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.FATS_AI_MATCHING_ENABLED === '1';
}

export function matchingDisabledResponse() {
  return Response.json(
    {
      error:
        'Resume matching is paused and unavailable during the private beta.',
      code: 'MATCHING_DISABLED',
    },
    { status: 403, headers: privateHeaders },
  );
}
