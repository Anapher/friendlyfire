import { NextRequest, NextResponse } from "next/server";
import {
  consumeMagicLink,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/server/auth";
import { db } from "@/server/db";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";

  try {
    const { session, sessionToken } = await consumeMagicLink(db, token);
    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions(session.expiresAt));
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url));
  }
}
