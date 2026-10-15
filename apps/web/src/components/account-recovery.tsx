'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useAccount } from './account-provider';
import { ActionLink, Button, Card, PageHeading } from './ui';

async function accountRequest(path: string, body: Record<string, string>) {
  const response = await fetch('/api/auth/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || 'We could not complete that request. Please retry.',
    );
}
export function VerificationForm({
  initialEmail = '',
  returnTo = '/settings',
  sent = false,
}: {
  initialEmail?: string;
  returnTo?: string;
  sent?: boolean;
}) {
  const account = useAccount();
  const [email, setEmail] = useState(initialEmail || account.user?.email || '');
  const [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(
      sent
        ? 'If this address can receive a verification code, check its inbox.'
        : '',
    );
  const [verified, setVerified] = useState(false),
    [remaining, setRemaining] = useState(sent ? 60 : 0);
  useEffect(() => {
    if (!remaining) return;
    const timer = setTimeout(() => setRemaining(remaining - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  async function send() {
    setBusy(true);
    setError('');
    try {
      await accountRequest('send-verification-email', { email });
      setRemaining(60);
      setMessage(
        'If this address can receive a verification code, check its inbox. Only the newest code works.',
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await accountRequest('verify-email', { email, code });
      setCode('');
      setVerified(true);
      await account.refreshSession(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A safer FATS account"
        title="Verify your email"
        description="One small step to keep your account yours."
      />
      <Card className="content-card auth-card">
        {verified || account.user?.emailVerified ? (
          <>
            <h2>Email verified.</h2>
            <p>
              Your email is verified. Sign in with your password to continue.
            </p>
            {account.user && !account.expired ? (
              <a className="button button-primary" href={returnTo}>
                Continue to your workspace
              </a>
            ) : (
              <a
                className="button button-primary"
                href={'/sign-in?next=' + encodeURIComponent(returnTo)}
              >
                Sign in to continue
              </a>
            )}
          </>
        ) : (
          <>
            <p>
              Enter the eight-digit code from your email. It expires after 10
              minutes and works once. Existing account records are kept while
              you verify.
            </p>
            <form className="job-form" onSubmit={verify}>
              <fieldset disabled={busy}>
                <label>
                  Email
                  <input
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label>
                  Verification code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{8}"
                    minLength={8}
                    maxLength={8}
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </label>
              </fieldset>
              <div className="form-footer">
                <Button type="submit" disabled={busy}>
                  {busy ? 'Checking…' : 'Verify email'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || remaining > 0 || !email}
                  onClick={() => void send()}
                >
                  {remaining > 0
                    ? `Resend in ${remaining}s`
                    : 'Send a new code'}
                </Button>
              </div>
            </form>
            <p className="field-hint">
              Check spam as well as your inbox. If delivery is interrupted, wait
              and request another code.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <p role="status">{message}</p>
      </Card>
    </>
  );
}
export function ForgotPasswordForm() {
  const [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await accountRequest('request-password-reset', { email });
      setMessage(
        'If an account uses this email, a reset link will arrive shortly. Check your inbox and spam. You can request another link if it does not arrive.',
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Let’s help you back in"
        title="Forgot your password?"
        description="We’ll help you choose a new one."
      />
      <Card className="content-card auth-card">
        <form className="job-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              disabled={busy}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <Button disabled={busy}>
            {busy ? 'Please wait…' : 'Send reset link'}
          </Button>
        </form>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <p role="status">{message}</p>
        <ActionLink href="/sign-in" variant="secondary">
          Back to sign in
        </ActionLink>
      </Card>
    </>
  );
}
export function ResetPasswordForm() {
  const account = useAccount();
  const [link, setLink] = useState<{ token: string } | null>(null);
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false);
  useEffect(() => {
    // Read private browser state after hydration. Cancel deferred work on
    // unmount (including Strict Mode's development setup/cleanup cycle).
    const timer = setTimeout(() => {
      const token =
        new URLSearchParams(location.hash.slice(1)).get('token') || '';
      history.replaceState(null, '', location.pathname);
      setLink({ token });
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('The passwords do not match. Please enter them again.');
      return;
    }
    setBusy(true);
    try {
      await accountRequest('reset-password', {
        token: link?.token || '',
        newPassword: password,
      });
      setPassword('');
      setConfirmation('');
      setDone(true);
      await account.refreshSession(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="A fresh start"
        title="Choose a new password"
        description="Use a password you don’t use anywhere else."
      />
      <Card className="content-card auth-card">
        {done ? (
          <>
            <h2>Your password is updated.</h2>
            <p role="status">
              All sessions for this account have been signed out. Sign in with
              your new password.
            </p>
            <ActionLink href="/sign-in">Back to sign in</ActionLink>
          </>
        ) : !link ? (
          <p role="status">Opening your reset link…</p>
        ) : !link.token ? (
          <>
            <p role="alert">
              This reset link is missing or unavailable. Request a new one.
            </p>
            <ActionLink href="/forgot-password">
              Request a new reset link
            </ActionLink>
          </>
        ) : (
          <>
            <form className="job-form" onSubmit={submit}>
              <fieldset disabled={busy}>
                <label>
                  New password
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
                <p className="field-hint">
                  Use 12–128 characters. Reset links expire after 30 minutes and
                  can be used once.
                </p>
              </fieldset>
              <Button disabled={busy}>
                {busy ? 'Updating…' : 'Reset password'}
              </Button>
            </form>
            <ActionLink href="/forgot-password" variant="secondary">
              Request a new reset link
            </ActionLink>
          </>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </Card>
    </>
  );
}
