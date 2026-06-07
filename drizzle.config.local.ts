import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

// Drizzle Studio against the LOCAL D1 database (the miniflare SQLite file that
// `wrangler dev` / `pnpm db:migrate:local` writes to). Usage: pnpm db:studio

const d1Dir = path.join(
  __dirname,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);

const sqliteFile = fs.existsSync(d1Dir)
  ? fs
      .readdirSync(d1Dir)
      .find((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite")
  : undefined;

if (!sqliteFile) {
  throw new Error(
    "No local D1 database found. Run `pnpm db:migrate:local` (or `pnpm dev`) first.",
  );
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./workers/api/db/schema/index.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: path.join(d1Dir, sqliteFile),
  },
});
