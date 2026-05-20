import { redirect } from "next/navigation";
import { requestMagicLinkAction } from "../actions";
import { getSessionUser } from "@/server/auth";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; sent?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const currentUser = await getSessionUser();
  if (currentUser) {
    redirect("/");
  }

  const params = await searchParams;

  return (
    <main className="auth-main">
      <section className="auth-panel">
        <h1>FriendlyFire</h1>
        <p className="muted">Sign in with the email on your existing account.</p>
        {params.sent ? (
          <p className="notice">If that email belongs to an active user, a login link is on its way.</p>
        ) : null}
        {params.error ? (
          <p className="error">That login link is invalid or expired. Request a new one.</p>
        ) : null}
        <form action={requestMagicLinkAction} className="form-grid single-column">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <button type="submit">Send login link</button>
        </form>
      </section>
    </main>
  );
}
