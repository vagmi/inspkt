---
name: widget-embed
description: Ship an embeddable JS widget (Preact, shadow DOM, single IIFE) that renders your data on any third-party site via a public, CORS-open API.
user-invocable: false
metadata:
  author: builder-workshop
  version: 1.0.0
---

# Embeddable widget

Adds a standalone, dependency-isolated widget that any site can embed with two
tags. It renders inside a **shadow root** (so the host page's CSS can't touch
it), is built as a single minified **IIFE** to `public/widget.js`, and talks to
a new **public, CORS-open** API group.

```html
<div data-mudhal="ITEM_ID"></div>
<script src="https://your-app.workers.dev/widget.js" async></script>
```

The example renders a read-only item card — swap `EmbedView` for a form,
booking button, live counter, etc.

## Prerequisites

- `pnpm add preact` (the widget uses Preact, not React, to stay tiny).

## Files to create

| From | To |
|------|----|
| `references/widget/index.tsx` | `widget/index.tsx` |
| `references/widget/api.ts` | `widget/api.ts` |
| `references/widget/embed-view.tsx` | `widget/embed-view.tsx` |
| `references/widget/styles.ts` | `widget/styles.ts` |
| `references/vite.config.widget.ts` | `vite.config.widget.ts` (repo root) |
| `references/tsconfig.widget.json` | `tsconfig.widget.json` (repo root) |
| `references/public-controller.ts` | `workers/api/controllers/public-controller.ts` |

## Wiring

### 1. Build script + types

In `package.json`:

```jsonc
"build": "pnpm run build:widget && react-router build",
"build:widget": "vite build --config vite.config.widget.ts",
```

In `tsconfig.json`, add the widget project to `references`:

```jsonc
"references": [
  { "path": "./tsconfig.node.json" },
  { "path": "./tsconfig.cloudflare.json" },
  { "path": "./tsconfig.widget.json" }
]
```

### 2. Serve `public/widget.js`

Uncomment the assets block in `wrangler.jsonc`:

```jsonc
"assets": { "directory": "./public/", "binding": "ASSETS" }
```

### 3. Public API group (`workers/api/index.ts`)

Register the public controller **before** the authed group so it matches first
and never hits `requireOrg`:

```ts
import { createPublicController } from "./controllers/public-controller";
// after app.get("/health", ...):
app.route("/public", createPublicController());
```

### 4. Unscoped public read

Apply `references/public-read-patch.md` — it adds `getPublicById` to the items
repo and `getPublic` to the items service (the public controller calls it).

## Verification

- `pnpm build:widget` — produces `public/widget.js` (a few KB).
- `pnpm typecheck` (the widget project is type-checked via `tsconfig.widget.json`).
- Manual: `pnpm dev`, create an item, copy its id, then load a plain HTML file
  containing the two embed tags pointed at `http://localhost:5173` and confirm
  the card renders. `GET /api/public/items/:id` should return JSON with CORS
  headers.

## Notes

- The bundle is built `charset: "ascii"` — any non-ASCII in widget code/CSS must
  be `\uXXXX`-escaped, since host pages without `<meta charset>` decode the
  script in their own encoding.
- Keep `widget/` dependency-free (no zod, no app imports that pull in heavy
  code) — the server re-validates everything.

## Reference files

- `references/widget/*`
- `references/vite.config.widget.ts`, `references/tsconfig.widget.json`
- `references/public-controller.ts`, `references/public-read-patch.md`
