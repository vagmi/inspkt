---
name: app-name
description: Rename the app to a custom name in one pass (display name + slug) without hunting through files.
user-invocable: false
metadata:
  author: builder-workshop
  version: 1.0.0
---

# Rename the app

The app name lives in two case-sensitive tokens across the repo:

- **display name** — e.g. `Mudhal` → used in wordmarks, page `<title>`s, doc
  headings, and the widget global `MudhalWidget`.
- **slug** — e.g. `mudhal` → used in `package.json`/`wrangler.jsonc` `name`, the
  D1 `database_name`, the `db:migrate` scripts, the widget `data-<slug>`
  attribute, `--<slug>-*` CSS variables, and the `<slug>-uploads` bucket name.

Don't hand-edit these. Run the bundled script — it detects the current name
automatically (slug from `package.json`, display from the README H1) and
rewrites both everywhere, skipping vendor/generated files.

## Usage

From the repository root:

```bash
node skills/app-name/references/rename-app.mjs "<New Name>" [new-slug]
```

Examples:

```bash
node skills/app-name/references/rename-app.mjs "Acme"
node skills/app-name/references/rename-app.mjs "Acme Co" acme   # custom slug
```

If `new-slug` is omitted it's derived from the name (lowercased, non-alphanumerics
→ `-`). The script prints every file it changed.

> Run it straight from `skills/` (the bundled copy) — that path is always
> present, so you don't need to `install-skill` first.

## After renaming

```bash
pnpm cf-typegen          # refresh worker types
pnpm typecheck && pnpm test
```

Restart `pnpm dev` if it's running.

Notes:

- The D1 **binding** stays `DB`, so your **local** database is untouched.
- `database_name` and the worker `name` only matter for new
  `wrangler d1 create` / deploys. If you already created a remote D1 under the
  old slug, either keep that name in `wrangler.jsonc` or create a new database
  and update `database_id`.
- This script intentionally does **not** modify `skills/app-name/` itself, so it
  keeps working after a rename.

## Manual fallback

If you'd rather do it by hand, replace the two tokens (case-sensitive) across
the repo, excluding `node_modules`, `.git`, `build`, `.wrangler`,
`.react-router`, and `pnpm-lock.yaml`. The slug also appears as `data-<slug>`,
`--<slug>-*`, `<Slug>Widget`, and `<slug>-uploads`.

## Reference files

- `references/rename-app.mjs`
