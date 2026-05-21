import { describe, expect, it } from "vitest";
import {
  createEmailAdapterFromEnv,
  smtpEmailAdapter,
  type SmtpTransporter,
} from "@/server/emailAdapter";

describe("email adapters", () => {
  it("sends transactional email through SMTP", async () => {
    const sent: unknown[] = [];
    const transporter: SmtpTransporter = {
      async sendMail(message) {
        sent.push(message);
      },
    };
    const adapter = smtpEmailAdapter({
      transporter,
      fromEmail: "FriendlyFire <login@example.com>",
    });

    await adapter.send({
      to: "friend@example.com",
      subject: "Login",
      text: "Magic link",
    });

    expect(sent).toEqual([
      {
        from: "FriendlyFire <login@example.com>",
        to: "friend@example.com",
        subject: "Login",
        text: "Magic link",
      },
    ]);
  });

  it("uses SMTP in production and requires credentials", () => {
    expect(() =>
      createEmailAdapterFromEnv({
        NODE_ENV: "production",
        SMTP_HOST: "smtp-relay.brevo.com",
        SMTP_PORT: "587",
        SMTP_USER: "user",
        SMTP_PASSWORD: "password",
        SMTP_FROM_EMAIL: "login@example.com",
      }),
    ).not.toThrow();

    expect(() =>
      createEmailAdapterFromEnv({
        NODE_ENV: "production",
        SMTP_PORT: "587",
        SMTP_USER: "user",
        SMTP_PASSWORD: "password",
        SMTP_FROM_EMAIL: "login@example.com",
      }),
    ).toThrow("SMTP_HOST must be configured in production");

    expect(() =>
      createEmailAdapterFromEnv({
        NODE_ENV: "production",
        SMTP_HOST: "smtp-relay.brevo.com",
        SMTP_PORT: "587",
        SMTP_USER: "user",
        SMTP_PASSWORD: "password",
      }),
    ).toThrow("SMTP_FROM_EMAIL must be configured in production");
  });
});
