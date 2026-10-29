import nodemailer from 'nodemailer';

export interface AccountEmail {
  to: string;
  subject: string;
  text: string;
}
export type AccountMailer = (email: AccountEmail) => Promise<void>;

export function createAccountMailer(
  origin = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  env: NodeJS.ProcessEnv = process.env,
  send: typeof fetch = fetch,
): AccountMailer {
  const url = new URL(origin);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  const provider = env.FATS_MAIL_PROVIDER ?? (local ? 'mailpit' : 'resend');
  if (provider === 'resend') {
    const key = env.RESEND_API_KEY?.trim();
    const from = env.FATS_MAIL_FROM?.trim();
    if (
      !key ||
      !/^re_[A-Za-z0-9_-]+$/.test(key) ||
      !from ||
      !/^[^\s<>@]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(from) ||
      /\.(?:test|invalid|localhost)$/i.test(from) ||
      from.toLowerCase().endsWith('@resend.dev')
    )
      throw new Error(
        'Configure RESEND_API_KEY and FATS_MAIL_FROM using your verified sending domain.',
      );
    return async (message) => {
      try {
        const response = await send('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'User-Agent': 'FATS/account-email',
          },
          body: JSON.stringify({
            from: `FATS <${from}>`,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error();
        }
        const result = await response.json();
        if (typeof result?.id !== 'string' || !result.id) throw new Error();
      } catch {
        // Provider bodies, tokens, recipients and transport diagnostics stay private.
        throw new Error('FATS account email delivery is unavailable.');
      }
    };
  }
  if (provider !== 'mailpit' || !local || env.VERCEL === '1')
    throw new Error(
      'Hosted accounts require the Resend email provider. Mailpit is loopback-only.',
    );
  const port = Number(env.FATS_MAIL_PORT ?? 1025);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Configure a valid local email testing port.');
  const transport = nodemailer.createTransport({
    host: '127.0.0.1',
    port,
    secure: false,
    ignoreTLS: true,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
  return async (message) => {
    try {
      await transport.sendMail({
        from: 'FATS <accounts@fats.test>',
        ...message,
      });
    } catch {
      throw new Error('FATS account email delivery is unavailable.');
    }
  };
}
