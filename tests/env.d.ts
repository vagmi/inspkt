import type { D1Migration } from "@cloudflare/workers-types/experimental";

declare module "cloudflare:test" {
  // ProvidedEnv is the `env` object available inside tests.
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[];
  }
}
