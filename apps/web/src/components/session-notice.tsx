'use client';
import { useAccount } from './account-provider';
export function SessionNotice() {
  const account = useAccount();
  if (!account.expired) return null;
  return (
    <p className="backup-warning">
      Your session ended. Keep these inputs open.{' '}
      <a
        className="text-link"
        href="/sign-in"
        target="_blank"
        rel="noopener noreferrer"
      >
        Sign in in a new tab
      </a>
      , then return here and retry.
    </p>
  );
}
