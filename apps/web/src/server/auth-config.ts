import type { BetterAuthOptions } from 'better-auth';
import { PostgresDialect } from 'kysely';
import type { Pool } from 'pg';
import { emailOTP } from 'better-auth/plugins';
import {
  createAccountMailer,
  type AccountMailer,
  type AccountEmail,
} from './account-email';

export function authOptions(
  pool: Pool,
  origin: string,
  secret: string,
  mailer: AccountMailer = createAccountMailer(),
): BetterAuthOptions {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !['http:', 'https:'].includes(url.protocol) ||
    (url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new Error(
      'Configure BETTER_AUTH_URL as an exact HTTPS origin (HTTP is local-only).',
    );
  if (secret.length < 32 || secret.startsWith('replace-'))
    throw new Error(
      'Configure a private BETTER_AUTH_SECRET of at least 32 characters.',
    );
  function deliver(message: AccountEmail) {
    // Only delivery runs in the background. OTP/token persistence must finish
    // inside the library's transaction before registration returns.
    void mailer(message).catch(() =>
      console.error(
        'FATS account email delivery is unavailable. Request a new message.',
      ),
    );
  }
  return {
    appName: 'FATS',
    baseURL: origin,
    secret,
    database: {
      dialect: new PostgresDialect({ pool }),
      type: 'postgres',
      transaction: true,
    },
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const link = new URL('/reset-password', origin);
        link.hash = new URLSearchParams({ token }).toString();
        deliver({
          to: user.email,
          subject: 'Reset your FATS password',
          text: `Choose a new password using this link:\n${link.href}\n\nThis link expires in 30 minutes and can be used once. If you did not request this, you can ignore it.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
    },
    verification: { storeIdentifier: 'hashed' },
    plugins: [
      emailOTP({
        overrideDefaultEmailVerification: true,
        disableSignUp: true,
        otpLength: 8,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        resendStrategy: 'rotate',
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== 'email-verification')
            throw new Error('Unsupported account email.');
          deliver({
            to: email,
            subject: 'Verify your FATS email',
            text: `Your FATS verification code is ${otp}.\n\nEnter it at ${origin}/verify-email. It expires in 10 minutes and can be used once. Only the newest code works. If you did not request this, you can ignore it.`,
          });
        },
      }),
    ],
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: url.protocol === 'https:',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      // This local server has no trusted reverse proxy. Do not trust arbitrary
      // X-Forwarded-For values; Better Auth uses a shared per-path bucket.
      ipAddress: { ipAddressHeaders: [] },
      database: { generateId: 'uuid' },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 20 },
        '/sign-up/email': { window: 60, max: 30 },
        '/get-session': false,
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/email-otp/verify-email': { window: 60, max: 30 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 10 },
      },
    },
    telemetry: { enabled: false },
    logger: { disabled: true },
  };
}
