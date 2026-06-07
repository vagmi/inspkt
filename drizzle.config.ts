import { defineConfig } from "drizzle-kit";

// Used for `pnpm db:generate` (no credentials needed) and
// `pnpm db:studio:remote` (requires the CLOUDFLARE_* env vars below).
// For Studio against the local dev database, use `pnpm db:studio`
// (drizzle.config.local.ts).

export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./workers/api/db/schema/index.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
});
