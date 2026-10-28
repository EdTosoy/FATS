'use client';
import { offerContinuationId } from '@/lib/offer-continuation';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from './account-provider';
import { ActionLink, Button, Card, PageHeading } from './ui';
import { VerificationForm } from './account-recovery';
export function AuthForm({ returnTo = '/settings' }: { returnTo?: string }) {
  const continuingOffer = offerContinuationId(returnTo) !== null;
  const account = useAccount();
  const router = useRouter();
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  const [registered, setRegistered] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/auth/${register ? 'sign-up/email' : 'sign-in/email'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            email,
            password,
            ...(register ? { name } : {}),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Authentication failed. Try again.');
      setPassword('');
      if (register) {
        setRegistered(true);
        return;
      }
      await account.refreshSession(true);
      const next = returnTo;
      const target = new URL(next, location.origin);
      const destination =
        target.origin === location.origin && target.pathname !== '/sign-in'
          ? target.pathname + target.search + target.hash
          : '/settings';
      // The extension injects its bridge only on a /sidekick document load.
      // An SPA transition from /sign-in would leave that bridge unavailable.
      if (target.origin === location.origin && target.pathname === '/sidekick')
        window.location.replace(destination);
      else router.replace(destination);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to connect. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (registered)
    return <VerificationForm initialEmail={email} returnTo={returnTo} sent />;
  return (
    <>
      <PageHeading
        eyebrow="Your FATS account"
        title={register ? 'A place for your next beginning.' : 'Welcome back.'}
        description={
          continuingOffer
            ? 'Sign in to keep private offer terms and letter versions in your own account. Then review your browser records before continuing to Offer Desk. New letter uploads also need available server safety checks.'
            : 'Keep your applications and interviews in your own account.'
        }
      />
      <Card className="content-card auth-card">
        {account.user && !account.expired ? (
          <>
            <h2>You’re signed in.</h2>
            <p>{account.user.email}</p>
            <ActionLink
              href={
                continuingOffer
                  ? account.user.emailVerified
                    ? returnTo
                    : '/verify-email?next=' + encodeURIComponent(returnTo)
                  : account.user.emailVerified
                    ? '/settings'
                    : '/verify-email'
              }
            >
              {account.user.emailVerified
                ? continuingOffer
                  ? 'Continue to Offer Desk'
                  : 'Open account settings'
                : 'Verify your email'}
            </ActionLink>
          </>
        ) : (
          <>
            <h2>{register ? 'Create an account' : 'Sign in'}</h2>
            {!account.configured && (
              <p className="backup-warning">
                Account storage needs local PostgreSQL configuration. Your
                browser workspace and backups remain available; see the
                developer setup guide.
              </p>
            )}
            <form onSubmit={submit} className="job-form">
              <fieldset disabled={busy}>
                {register && (
                  <label>
                    Your name
                    <input
                      required
                      maxLength={80}
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                )}
                <label>
                  Email
                  <input
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete={
                      register ? 'new-password' : 'current-password'
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby="password-hint"
                  />
                </label>
                <p id="password-hint" className="field-hint">
                  Use 12–128 characters. Verify your email before opening your
                  account.
                </p>
              </fieldset>
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <div className="form-footer">
                <Button type="submit" disabled={busy || !account.configured}>
                  {busy
                    ? 'Please wait…'
                    : register
                      ? 'Create account'
                      : 'Sign in'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setRegister(!register);
                    setError('');
                  }}
                >
                  {register ? 'I already have an account' : 'Create an account'}
                </Button>
              </div>
            </form>
            <p>
              <a className="text-link" href="/forgot-password">
                Forgot your password?
              </a>
            </p>
            <p>
              <a
                className="text-link"
                href={'/verify-email?next=' + encodeURIComponent(returnTo)}
              >
                Verify your email or request a new code
              </a>
            </p>
            <p className="field-hint">
              {continuingOffer
                ? 'Signing in keeps your browser records separate. Next, you can preview and confirm a copy to this account. Originals stay in this browser.'
                : 'Signing in does not upload or delete browser records. Copy them separately in Settings after reviewing the transfer.'}
            </p>
          </>
        )}
      </Card>
    </>
  );
}
