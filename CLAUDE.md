# FriendlyFire — project conventions

## Invariants

### Auth: keep users logged in as long as possible

Re-authentication is friction we want to minimise. Users should sign in
once and stay signed in — no inactivity timeouts, no quarterly
re-prompts. The current implementation uses a 180-day absolute session
TTL (`SESSION_TTL_MS` in `src/server/auth.ts`); if you change the
session lifetime, only change it upward, never downward, and never
introduce sliding-window expiry that punishes infrequent users.

The 15-minute magic-link TTL (`MAGIC_LINK_TTL_MS`) is a separate
concern (it bounds the credential window after a sign-in email is
sent) and is not subject to this invariant.
