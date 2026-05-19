export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type EmailAdapter = {
  send(message: EmailMessage): Promise<void>;
};

export const consoleEmailAdapter: EmailAdapter = {
  async send(message) {
    console.log(`Email to: ${message.to}`);
    console.log(`Subject: ${message.subject}`);
    console.log(message.text);
  },
};
