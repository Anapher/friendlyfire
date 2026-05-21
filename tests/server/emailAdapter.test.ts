import { describe, expect, it } from "vitest";
import {
  createEmailAdapterFromEnv,
  postmarkEmailAdapter,
  type PostmarkClient,
} from "@/server/emailAdapter";

describe("email adapters", () => {
  it("sends transactional email through Postmark", async () => {
    const sent: unknown[] = [];
    const client: PostmarkClient = {
      async sendEmail(message) {
        sent.push(message);
      },
    };
    const adapter = postmarkEmailAdapter({
      client,
      fromEmail: "FriendlyFire <login@example.com>",
    });

    await adapter.send({
      to: "friend@example.com",
      subject: "Login",
      text: "Magic link",
    });

    expect(sent).toEqual([
      {
        From: "FriendlyFire <login@example.com>",
        To: "friend@example.com",
        Subject: "Login",
        TextBody: "Magic link",
        MessageStream: "outbound",
      },
    ]);
  });

  it("uses Postmark in production and requires credentials", () => {
    expect(() =>
      createEmailAdapterFromEnv({
        NODE_ENV: "production",
        POSTMARK_SERVER_TOKEN: "token",
        POSTMARK_FROM_EMAIL: "login@example.com",
      }),
    ).not.toThrow();

    expect(() =>
      createEmailAdapterFromEnv({
        NODE_ENV: "production",
        POSTMARK_FROM_EMAIL: "login@example.com",
      }),
    ).toThrow("POSTMARK_SERVER_TOKEN must be configured in production");

    expect(() =>
      createEmailAdapterFromEnv({
        NODE_ENV: "production",
        POSTMARK_SERVER_TOKEN: "token",
      }),
    ).toThrow("POSTMARK_FROM_EMAIL must be configured in production");
  });
});
