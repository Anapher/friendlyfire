import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailAdapter = {
  send(message: EmailMessage): Promise<void>;
};

export type SmtpTransporter = {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
};

export const consoleEmailAdapter: EmailAdapter = {
  async send(message) {
    console.log(`Email to: ${message.to}`);
    console.log(`Subject: ${message.subject}`);
    console.log(message.text);
  },
};

export function smtpEmailAdapter({
  transporter,
  fromEmail,
}: {
  transporter: SmtpTransporter;
  fromEmail: string;
}): EmailAdapter {
  return {
    async send(message) {
      await transporter.sendMail({
        from: fromEmail,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}

type EmailEnv = {
  NODE_ENV?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM_EMAIL?: string;
};

export function createEmailAdapterFromEnv(
  env: EmailEnv = process.env,
  transporterFactory: (options: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  }) => SmtpTransporter = (options) => nodemailer.createTransport(options),
): EmailAdapter {
  if (env.NODE_ENV !== "production") {
    return consoleEmailAdapter;
  }

  if (!env.SMTP_HOST) {
    throw new Error("SMTP_HOST must be configured in production");
  }
  if (!env.SMTP_PORT) {
    throw new Error("SMTP_PORT must be configured in production");
  }
  if (!env.SMTP_USER) {
    throw new Error("SMTP_USER must be configured in production");
  }
  if (!env.SMTP_PASSWORD) {
    throw new Error("SMTP_PASSWORD must be configured in production");
  }
  if (!env.SMTP_FROM_EMAIL) {
    throw new Error("SMTP_FROM_EMAIL must be configured in production");
  }

  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_PORT must be a positive integer");
  }

  return smtpEmailAdapter({
    transporter: transporterFactory({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    }),
    fromEmail: env.SMTP_FROM_EMAIL,
  });
}
