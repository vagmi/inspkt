#!/usr/bin/env node
// Read-only sanity check for local setup. Never edits anything.
//   pnpm doctor

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let problems = 0;
const ok = (m) => console.log(`  ${c.green("✓")} ${m}`);
const warn = (m, hint) => {
  console.log(`  ${c.yellow("!")} ${m}`);
  if (hint) console.log(`    ${c.dim(hint)}`);
};
const bad = (m, hint) => {
  problems++;
  console.log(`  ${c.red("✗")} ${m}`);
  if (hint) console.log(`    ${c.dim(hint)}`);
};

function parseEnvFile(p) {
  if (!fs.existsSync(p)) return null;
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const isPlaceholder = (v) =>
  !v || /xxx|REPLACE|your[_-]/i.test(v) || v.endsWith("_xxx");

console.log(`\n${c.bold("Mudhal doctor")}\n`);

// --- .dev.vars ---
console.log(c.bold(".dev.vars (server secrets)"));
const devVars = parseEnvFile(path.join(ROOT, ".dev.vars"));
if (!devVars) {
  bad(".dev.vars is missing", "cp .dev.vars.example .dev.vars and fill it in");
} else {
  for (const key of ["CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"]) {
    if (isPlaceholder(devVars[key])) bad(`${key} is unset or a placeholder`);
    else ok(key);
  }
}

// --- .env.local ---
console.log(`\n${c.bold(".env.local (browser Clerk keys)")}`);
const envLocal = parseEnvFile(path.join(ROOT, ".env.local"));
if (!envLocal) {
  bad(".env.local is missing", "cp .env.local.example .env.local and fill it in");
} else if (isPlaceholder(envLocal.VITE_CLERK_PUBLISHABLE_KEY)) {
  bad("VITE_CLERK_PUBLISHABLE_KEY is unset or a placeholder");
} else {
  ok("VITE_CLERK_PUBLISHABLE_KEY");
}

// --- wrangler.jsonc ---
console.log(`\n${c.bold("wrangler.jsonc")}`);
const wrangler = fs.readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8");
if (/REPLACE_WITH_YOUR_D1_DATABASE_ID/.test(wrangler)) {
  bad(
    "database_id is still the placeholder",
    "npx wrangler d1 create mudhal, then paste the id into wrangler.jsonc",
  );
} else {
  ok("D1 database_id is set");
}

// --- local migrations ---
console.log(`\n${c.bold("Local database")}`);
const d1Dir = path.join(
  ROOT,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const hasSqlite =
  fs.existsSync(d1Dir) &&
  fs
    .readdirSync(d1Dir)
    .some((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
if (hasSqlite) ok("local D1 database exists (migrations applied)");
else
  warn(
    "no local D1 database yet",
    "run `pnpm db:migrate:local` (or `pnpm dev`) to create it",
  );

console.log();
if (problems === 0) {
  console.log(c.green("All good. Run `pnpm dev`.\n"));
} else {
  console.log(c.red(`${problems} thing(s) need attention above.\n`));
  process.exit(1);
}
