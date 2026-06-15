// Augments the generated `Env` (worker-configuration.d.ts) with the baseline
// secret bindings that live in .dev.vars. Committed so `tsc` passes on a fresh
// clone before .dev.vars exists. When .dev.vars is present, `wrangler types`
// also adds these keys — interface merging keeps the (identical) types in sync.
//
// When a skill needs a new secret, add it here too.
interface Env {
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  CLERK_WEBHOOK_SECRET: string;
  APP_URL: string;
  // HMAC pepper for hashing API keys (machine access). Set once and treat as
  // permanent — rotating it invalidates every existing key. `wrangler secret
  // put API_KEY_PEPPER` in prod; a value in .dev.vars for local dev.
  API_KEY_PEPPER: string;
  // r2-uploads (Phase 3): the UPLOADS R2Bucket binding is typed by
  // `wrangler types`. The bucket is PRIVATE — photos are served through the
  // authenticated /api/uploads/:key route, so there is no public base URL.
}
