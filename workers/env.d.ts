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
  // Urai chat widget (setup assistant). URAI_CHAT_BASE is the chat-service
  // origin the browser widget talks to (default https://chat.app.urai.dev).
  // URAI_WIDGET_TOKEN is the public widget token from the Urai dashboard.
  // WIDGET_TOKEN_SECRET signs the short-lived `inspktw_` tokens the widget's
  // UraiJS tools use to call our API — rotating it invalidates every live one.
  URAI_CHAT_BASE: string;
  URAI_WIDGET_TOKEN: string;
  WIDGET_TOKEN_SECRET: string;
  // r2-uploads (Phase 3): the UPLOADS R2Bucket binding is typed by
  // `wrangler types`. The bucket is PRIVATE — photos are served through the
  // authenticated /api/uploads/:key route, so there is no public base URL.
}
