import { ServerClient } from "postmark";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailAdapter = {
  send(message: EmailMessage): Promise<void>;
};

export type PostmarkClient = {
  sendEmail(message: {
    From: string;
    To: string;
    Subject: string;
    TextBody: string;
    MessageStream: string;
  }): Promise<unknown>;
};

export const consoleEmailAdapter: EmailAdapter = {
  async send(message) {
    console.log(`Email to: ${message.to}`);
    console.log(`Subject: ${message.subject}`);
    console.log(message.text);
  },
};

export function postmarkEmailAdapter({
  client,
  fromEmail,
  messageStream = "outbound",
}: {
  client: PostmarkClient;
  fromEmail: string;
  messageStream?: string;
}): EmailAdapter {
  return {
    async send(message) {
      await client.sendEmail({
        From: fromEmail,
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        MessageStream: messageStream,
      });
    },
  };
}

type EmailEnv = {
  NODE_ENV?: string;
  POSTMARK_SERVER_TOKEN?: string;
  POSTMARK_FROM_EMAIL?: string;
  POSTMARK_MESSAGE_STREAM?: string;
};

export function createEmailAdapterFromEnv(
  env: EmailEnv = process.env,
  clientFactory: (token: string) => PostmarkClient = (token) => new ServerClient(token),
): EmailAdapter {
  if (env.NODE_ENV !== "production") {
    return consoleEmailAdapter;
  }

  if (!env.POSTMARK_SERVER_TOKEN) {
    throw new Error("POSTMARK_SERVER_TOKEN must be configured in production");
  }
  if (!env.POSTMARK_FROM_EMAIL) {
    throw new Error("POSTMARK_FROM_EMAIL must be configured in production");
  }

  return postmarkEmailAdapter({
    client: clientFactory(env.POSTMARK_SERVER_TOKEN),
    fromEmail: env.POSTMARK_FROM_EMAIL,
    messageStream: env.POSTMARK_MESSAGE_STREAM ?? "outbound",
  });
}
