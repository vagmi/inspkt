import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // Read D1 migrations so tests/setup.ts can apply them to the test database.
  const migrations = await readD1Migrations(
    path.join(__dirname, "drizzle/migrations"),
  );

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    resolve: {
      alias: {
        "~": path.resolve(__dirname, "app"),
      },
    },
    test: {
      include: ["tests/**/*.test.ts"],
      setupFiles: ["./tests/setup.ts"],
    },
  };
});
