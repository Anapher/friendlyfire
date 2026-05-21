import { redirect } from "next/navigation";
import { requestMagicLinkAction } from "../actions";
import { Button } from "../_ui/Button";
import { Field, fieldInputClasses } from "../_ui/Field";
import { getSessionUser } from "@/server/auth";
import { LoginToasts } from "./LoginToasts";

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
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <LoginToasts sent={params.sent} error={params.error} />
      <section className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-panel p-5 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">FriendlyFire</h1>
          <p className="text-sm text-muted">
            Sign in with the email on your existing account.
          </p>
        </div>

        {params.sent ? (
          <p
            role="status"
            className="rounded-md border border-success/20 bg-success/10 px-3 py-2 text-sm text-success"
          >
            If that email belongs to an active user, a login link is on its way.
          </p>
        ) : null}
        {params.error ? (
          <p
            role="alert"
            className="rounded-md border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            That login link is invalid or expired. Request a new one.
          </p>
        ) : null}

        <form action={requestMagicLinkAction} className="space-y-3">
          <Field label="Email" htmlFor="login-email">
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              className={fieldInputClasses("h-12")}
            />
          </Field>
          <Button type="submit" fullWidth>
            Send login link
          </Button>
        </form>
      </section>
    </main>
  );
}
