# FriendlyFire Deployment

FriendlyFire is configured for Vercel, Supabase Postgres, Prisma, and Brevo SMTP.

## Vercel

1. Create a Vercel project from this repository.
2. Create a Supabase project and use its Postgres database.
3. Set the production environment variables:
   - `DATABASE_URL`: Supabase pooled connection string for app traffic, usually the Supavisor pooler URL on port `6543` with `pgbouncer=true`.
   - `DIRECT_URL`: Supabase direct database connection string on port `5432`, used by Prisma migrations.
   - `APP_BASE_URL`: production origin, for example `https://friendlyfire.example.com`.
   - `SMTP_HOST`: Brevo SMTP server, usually `smtp-relay.brevo.com`.
   - `SMTP_PORT`: Brevo SMTP port, usually `587`.
   - `SMTP_USER`: Brevo SMTP login.
   - `SMTP_PASSWORD`: Brevo SMTP password.
   - `SMTP_FROM_EMAIL`: verified sender, for example `FriendlyFire <login@example.com>`.
4. Deploy. Vercel runs `npm run vercel-build`, which generates Prisma Client, applies pending migrations with `prisma migrate deploy`, then builds Next.js.

Reference docs:
- Supabase with Prisma: https://supabase.com/docs/guides/database/prisma
- Prisma with Supabase: https://www.prisma.io/docs/orm/overview/databases/supabase
- Brevo SMTP relay: https://help.brevo.com/hc/en-us/articles/209462765-What-is-Brevo-SMTP
- Nodemailer SMTP transport: https://nodemailer.com/smtp/

## Local Development

Use a Postgres database for local development too. Copy `.env.example` to `.env`, replace `DATABASE_URL` and `DIRECT_URL` with your Supabase strings, then run:

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

In non-production environments, login emails are printed to the console. Production uses Brevo SMTP and refuses to start magic-link sending unless all SMTP settings are configured.

## Tests

Domain tests and email-adapter tests do not need a database:

```bash
npm run test:unit
```

The full server test suite uses Prisma and requires a Postgres test database. Set `TEST_DATABASE_URL` to a disposable pooled Supabase or local Postgres database URL. If using Supabase, also set `TEST_DIRECT_URL` to the matching direct connection string. Each test file uses its own temporary Postgres schema.
