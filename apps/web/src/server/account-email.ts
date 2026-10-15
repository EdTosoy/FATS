import nodemailer from 'nodemailer';

export interface AccountEmail {
  to: string;
  subject: string;
  text: string;
}
export type AccountMailer = (email: AccountEmail) => Promise<void>;

// This slice delivers only to a local testing inbox. A hosted SMTP provider and
// its credentials require separately reviewed deployment configuration.
export function createAccountMailer(): AccountMailer {
  const port = Number(process.env.FATS_MAIL_PORT ?? 1025);
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
