import { applyD1Migrations, env } from "cloudflare:test";

// Each test run gets a fresh D1 database; bring it up to date.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
