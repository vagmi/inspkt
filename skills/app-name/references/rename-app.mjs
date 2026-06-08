#!/usr/bin/env node
// Rename the app in a single pass — no hunting through files.
//
// Usage (run from the repo root):
//   node skills/app-name/references/rename-app.mjs "<New Name>" [new-slug]
//
// Examples:
//   node skills/app-name/references/rename-app.mjs "Acme"
//   node skills/app-name/references/rename-app.mjs "Acme Co" acme
//
// The app name appears as exactly two case-sensitive tokens; this replaces
// both everywhere:
//   • display name — e.g. "Mudhal" → "Acme"
//     (wordmarks, page <title>s, doc headings, the widget global "MudhalWidget")
//   • slug — e.g. "mudhal" → "acme"
//     (package.json/wrangler "name" + D1 database_name, db:migrate scripts,
//      data-<slug> widget attribute, --<slug>-* CSS vars, <slug>-uploads bucket)
//
// Zero dependencies. Edits text files in place; skips generated/vendor dirs.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// Guard: must be run from the repo root.
if (
  !fs.existsSync(path.join(ROOT, "package.json")) ||
  !fs.existsSync(path.join(ROOT, "wrangler.jsonc"))
) {
  console.error(
    "Run this from the repository root (where package.json and wrangler.jsonc live).",
  );
  process.exit(1);
}

const [newDisplayRaw, newSlugRaw] = process.argv.slice(2);
if (!newDisplayRaw) {
  console.error('Usage: node rename-app.mjs "<New Name>" [new-slug]');
  process.exit(1);
}

const slugify = (s) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const newDisplay = newDisplayRaw.trim();
const newSlug = (newSlugRaw && slugify(newSlugRaw)) || slugify(newDisplay);
if (!newSlug) {
  console.error("Could not derive a slug from the name — pass one explicitly.");
  process.exit(1);
}

// --- detect the CURRENT name ---
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const curSlug = pkg.name;

// Display name: prefer the README H1, else capitalize the slug.
let curDisplay = curSlug.charAt(0).toUpperCase() + curSlug.slice(1);
try {
  const h1 = fs
    .readFileSync(path.join(ROOT, "README.md"), "utf8")
    .match(/^#\s+(.+?)\s*$/m);
  if (h1) curDisplay = h1[1].trim();
} catch {
  /* keep the fallback */
}

if (curSlug === newSlug && curDisplay === newDisplay) {
  console.log(`Already named "${curDisplay}" (${curSlug}). Nothing to do.`);
  process.exit(0);
}

// --- walk + replace ---
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".claude", // local, machine-specific state (permissions, installed skills)
  "build",
  ".wrangler",
  ".react-router",
  "dist",
]);
// Skip these specific paths (not every dir that happens to share the name):
// the top-level reference app, and this skill itself (so it keeps working).
const SKIP_PATHS = new Set([
  path.join(ROOT, "references"),
  path.join(ROOT, "skills", "app-name"),
]);
const SKIP_FILES = new Set(["pnpm-lock.yaml", "worker-configuration.d.ts"]);
const EXTS = new Set([
  ".md",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".jsonc",
  ".css",
  ".html",
]);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slugRe = new RegExp(escapeRe(curSlug), "g");
const displayRe = new RegExp(escapeRe(curDisplay), "g");

let changed = 0;
const touched = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_PATHS.has(full)) continue;
      walk(full);
    } else if (entry.isFile()) {
      if (SKIP_FILES.has(entry.name)) continue;
      if (entry.name.endsWith(".tsbuildinfo")) continue;
      if (!EXTS.has(path.extname(entry.name))) continue;
      const before = fs.readFileSync(full, "utf8");
      // slug first (lowercase) then display (capitalized) — disjoint by case.
      const after = before.replace(slugRe, newSlug).replace(displayRe, newDisplay);
      if (after !== before) {
        fs.writeFileSync(full, after);
        changed++;
        touched.push(path.relative(ROOT, full));
      }
    }
  }
}

walk(ROOT);

console.log(
  `\nRenamed "${curDisplay}" → "${newDisplay}" and "${curSlug}" → "${newSlug}" in ${changed} file(s):`,
);
for (const f of touched.sort()) console.log(`  ${f}`);

console.log(`
Next steps:
  1. pnpm cf-typegen        # refresh worker types
  2. pnpm typecheck && pnpm test
  3. Restart \`pnpm dev\` if it's running.

Notes:
  • The D1 binding stays \`DB\`, so your LOCAL database is unaffected.
  • \`database_name\`/worker \`name\` only matter for new \`wrangler d1 create\` /
    deploys. If you already created a remote D1 under "${curSlug}", either keep
    that name in wrangler.jsonc or create a new one and update database_id.
`);
