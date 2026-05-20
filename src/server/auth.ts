import type { PrismaClient, User } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { domainError } from "@/domain/errors";
import { db } from "./db";
import type { EmailAdapter } from "./emailAdapter";
import { audit } from "./audit";

export const SESSION_COOKIE_NAME = "friendlyfire_session";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type AuthPrisma = PrismaClient;

export function sessionCookieOptions(expiresAt: Date) {
  return {
    expires: expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function requestMagicLink(
  prisma: AuthPrisma,
  email: string,
  emailAdapter: EmailAdapter,
  baseUrl: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = normalizedEmail
    ? await prisma.user.findUnique({ where: { email: normalizedEmail } })
    : null;

  if (!user || user.status !== "ACTIVE") {
    return { ok: true };
  }

  const token = randomToken();
  const tokenRow = await prisma.magicLoginToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    },
  });
  const loginUrl = `${baseUrl.replace(/\/$/, "")}/auth/magic?token=${encodeURIComponent(token)}`;

  await emailAdapter.send({
    to: user.email,
    subject: "Your FriendlyFire login link",
    text: [
      "Use this link to sign in to FriendlyFire:",
      "",
      loginUrl,
      "",
      "This link expires in 15 minutes. If you did not request it, you can ignore this email.",
    ].join("\n"),
  });

  await audit(prisma, {
    actorUserId: user.id,
    action: "MAGIC_LINK_REQUESTED",
    entityType: "User",
    entityId: user.id,
    metadata: {
      magicLoginTokenId: tokenRow.id,
      expiresAt: tokenRow.expiresAt.toISOString(),
    },
  });

  return { ok: true };
}

export async function consumeMagicLink(prisma: AuthPrisma, token: string) {
  const tokenHash = hashToken(token);

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const magicToken = await tx.magicLoginToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !magicToken ||
      magicToken.consumedAt ||
      magicToken.expiresAt.getTime() <= now.getTime() ||
      magicToken.user.status !== "ACTIVE"
    ) {
      throw domainError("INVALID_MAGIC_LINK", "Magic link is invalid or expired");
    }

    const consumed = await tx.magicLoginToken.updateMany({
      where: {
        id: magicToken.id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw domainError("INVALID_MAGIC_LINK", "Magic link is invalid or expired");
    }

    const sessionToken = randomToken();
    const session = await tx.session.create({
      data: {
        userId: magicToken.userId,
        tokenHash: hashToken(sessionToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    await audit(tx, {
      actorUserId: magicToken.userId,
      action: "MAGIC_LINK_CONSUMED",
      entityType: "Session",
      entityId: session.id,
      metadata: {
        magicLoginTokenId: magicToken.id,
        sessionId: session.id,
        consumedAt: now.toISOString(),
        sessionExpiresAt: session.expiresAt.toISOString(),
      },
    });

    return {
      session,
      sessionToken,
      user: magicToken.user,
    };
  });
}

export async function getSessionUser(prisma: AuthPrisma = db) {
  const cookieStore = await cookies();
  return getSessionUserByToken(prisma, cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export async function getSessionUserByToken(prisma: AuthPrisma, sessionToken?: string | null) {
  if (!sessionToken) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(sessionToken) },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() <= Date.now() || session.user.status !== "ACTIVE") {
    return null;
  }

  return session.user;
}

export async function requireCurrentUser(prisma: AuthPrisma = db): Promise<User> {
  const user = await getSessionUser(prisma);
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireAdminUser(prisma: AuthPrisma = db): Promise<User> {
  const user = await requireCurrentUser(prisma);
  if (user.role !== "ADMIN") {
    throw domainError("UNAUTHORIZED_ADMIN_ACTION", "Only admins can access this page");
  }
  return user;
}

export async function setCurrentSession(sessionToken: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions(expiresAt));
}

export async function clearCurrentSession(prisma: AuthPrisma = db) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    const tokenHash = hashToken(sessionToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    await prisma.session.deleteMany({ where: { tokenHash } });

    if (session) {
      await audit(prisma, {
        actorUserId: session.userId,
        action: "SESSION_LOGGED_OUT",
        entityType: "Session",
        entityId: session.id,
        metadata: { sessionId: session.id },
      });
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
