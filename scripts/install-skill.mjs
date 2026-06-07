#!/usr/bin/env node
// Install a bundled skill so Claude can read it.
//
//   pnpm install-skill                 list available skills
//   pnpm install-skill <name>          install skills/<name> -> .claude/skills/<name>
//   pnpm install-skill uninstall <n>   remove an installed skill
//
// Zero dependencies — Node built-ins only. Copies the skill, records it in
// skills-lock.json, and PRINTS (never auto-applies) the env vars / wrangler
// bindings / deps the skill needs.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const INSTALL_DIR = path.join(ROOT, ".claude", "skills");
const LOCK_FILE = path.join(ROOT, "skills-lock.json");

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

function readFrontmatter(skillMdPath) {
  const text = fs.readFileSync(skillMdPath, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const block = m ? m[1] : "";
  const field = (name) => {
    const fm = block.match(new RegExp(`^${name}:\\s*(.+)$`, "m"));
    return fm ? fm[1].trim() : "";
  };
  return { name: field("name"), description: field("description") };
}

function readRequirements(skillDir) {
  const p = path.join(skillDir, "requirements.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function listSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) =>
      fs.existsSync(path.join(SKILLS_DIR, name, "SKILL.md")),
    )
    .sort();
}

function readLock() {
  if (!fs.existsSync(LOCK_FILE)) return { version: 1, skills: {} };
  return JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
}

function writeLock(lock) {
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2) + "\n");
}

function hashFile(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function printList() {
  const skills = listSkills();
  const lock = readLock();
  console.log(`\n${c.bold("Available skills")} ${c.dim("(in skills/)")}\n`);
  if (skills.length === 0) {
    console.log(c.dim("  none found"));
    return;
  }
  for (const name of skills) {
    const dir = path.join(SKILLS_DIR, name);
    const { description } = readFrontmatter(path.join(dir, "SKILL.md"));
    const installed = Boolean(lock.skills[name]);
    const tag = installed ? c.green("  ✓ installed") : "";
    console.log(`  ${c.cyan(name)}${tag}`);
    if (description) console.log(`    ${c.dim(description)}`);
  }
  console.log(
    `\n${c.dim("Install with:")} ${c.bold("pnpm install-skill <name>")}\n`,
  );
}

function printRequirements(req) {
  if (!req) return;
  const has =
    (req.env?.length ?? 0) +
      (req.bindings?.length ?? 0) +
      (req.deps?.length ?? 0) +
      (req.commands?.length ?? 0) +
      (req.notes?.length ?? 0) >
    0;
  if (!has) return;

  console.log(`\n${c.bold("Before this skill works, you'll need to:")}\n`);

  if (req.deps?.length) {
    console.log(c.yellow("  Dependencies"));
    for (const d of req.deps) console.log(`    • ${d}`);
    console.log();
  }
  if (req.env?.length) {
    console.log(c.yellow("  Environment variables"));
    for (const e of req.env) {
      console.log(`    • ${c.bold(e.name)}=${e.example}  ${c.dim(`(${e.file ?? ".dev.vars"})`)}`);
      if (e.note) console.log(`      ${c.dim(e.note)}`);
    }
    console.log();
  }
  if (req.bindings?.length) {
    console.log(c.yellow("  wrangler.jsonc bindings"));
    for (const b of req.bindings) console.log(`    • ${b.snippet}`);
    console.log();
  }
  if (req.commands?.length) {
    console.log(c.yellow("  Commands to run"));
    for (const cmd of req.commands) console.log(`    $ ${cmd}`);
    console.log();
  }
  if (req.notes?.length) {
    console.log(c.yellow("  Notes"));
    for (const n of req.notes) console.log(`    • ${n}`);
    console.log();
  }
}

function install(name) {
  const src = path.join(SKILLS_DIR, name);
  if (!fs.existsSync(path.join(src, "SKILL.md"))) {
    console.error(c.red(`\nNo such skill: ${name}`));
    console.error(c.dim("Run `pnpm install-skill` to see what's available.\n"));
    process.exit(1);
  }

  const dest = path.join(INSTALL_DIR, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });

  const lock = readLock();
  lock.skills[name] = {
    source: "bundled",
    sourceType: "local",
    skillPath: `skills/${name}/SKILL.md`,
    computedHash: hashFile(path.join(src, "SKILL.md")),
  };
  writeLock(lock);

  console.log(
    `\n${c.green("✓")} Installed ${c.cyan(name)} → ${c.dim(".claude/skills/" + name + "/")}`,
  );
  console.log(
    c.dim("  Claude will now read this skill. Ask it to add the feature."),
  );
  printRequirements(readRequirements(src));
}

function uninstall(name) {
  const dest = path.join(INSTALL_DIR, name);
  const lock = readLock();
  const known = fs.existsSync(dest) || lock.skills[name];
  if (!known) {
    console.error(c.red(`\n${name} is not installed.\n`));
    process.exit(1);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  delete lock.skills[name];
  writeLock(lock);
  console.log(`\n${c.green("✓")} Uninstalled ${c.cyan(name)}`);
  console.log(
    c.dim("  Note: this does not revert any code the skill helped you write.\n"),
  );
}

// ---- main ----
const [arg1, arg2] = process.argv.slice(2);

if (!arg1 || arg1 === "list") {
  printList();
} else if (arg1 === "uninstall" || arg1 === "remove") {
  if (!arg2) {
    console.error(c.red("\nUsage: pnpm install-skill uninstall <name>\n"));
    process.exit(1);
  }
  uninstall(arg2);
} else {
  install(arg1);
}
