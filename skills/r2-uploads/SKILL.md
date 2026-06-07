---
name: r2-uploads
description: Accept file uploads and store them in a Cloudflare R2 bucket with org-scoped, unguessable keys and a public URL.
user-invocable: false
metadata:
  author: builder-workshop
  version: 1.0.0
---

# File uploads with R2

Adds an uploads **service** and a **controller** at `/api/uploads` that streams
a multipart file into a Cloudflare R2 bucket and returns a public URL. Object
keys are prefixed with the org id (`orgId/<random>.ext`) so tenants are
isolated and filenames can't collide or leak.

For R2 binding details, also consult the bundled **cloudflare** skill.

## Prerequisites

- A Cloudflare account with R2 enabled.
- Create the bucket and enable public access (dashboard → R2 → your bucket →
  Settings → Public access) to get its `pub-….r2.dev` URL.
- Add to `.dev.vars`: `R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev`
- Add `R2_PUBLIC_BASE_URL: string` to `workers/env.d.ts`.

```
npx wrangler r2 bucket create mudhal-uploads
```

## Wiring

### 1. Add the binding (`wrangler.jsonc`)

Uncomment (or add) the R2 block, then regenerate types:

```jsonc
"r2_buckets": [{ "binding": "UPLOADS", "bucket_name": "mudhal-uploads" }]
```

```
pnpm cf-typegen   # makes env.UPLOADS a typed R2Bucket
```

### 2. Env type (`workers/env.d.ts`)

```ts
interface Env {
  // ...
  R2_PUBLIC_BASE_URL: string;
}
```

(`UPLOADS` comes from `cf-typegen`, not env.d.ts.)

### 3. Files to create

1. `workers/api/services/uploads-service.ts` — copy from `references/uploads-service.ts`.
2. `workers/api/controllers/uploads-controller.ts` — copy from `references/uploads-controller.ts`.

### 4. Register the service (`workers/api/services/index.ts`)

```ts
import { createUploadsService } from "./uploads-service";

export function createServices(env: Env) {
  // ...
  return {
    // ...
    uploads: createUploadsService({
      bucket: env.UPLOADS,
      publicBaseUrl: env.R2_PUBLIC_BASE_URL,
    }),
  };
}
```

### 5. Mount the controller (`workers/api/index.ts`)

Inside the **authed** group:

```ts
import { createUploadsController } from "./controllers/uploads-controller";
// ...
authed.route("/uploads", createUploadsController());
```

### 6. (Optional) attach uploads to a resource

See `references/items-schema-patch.md` to add an `imageKey` column to `items`.

## Frontend snippet

```tsx
const fd = new FormData();
fd.append("file", fileInput.files[0]);
const res = await fetch("/api/uploads", { method: "POST", body: fd });
const { url } = await res.json(); // public URL to store/display
```

## Verification

- `pnpm typecheck` (after `cf-typegen` so `env.UPLOADS` exists).
- Unit-test the service with a fake bucket (`{ put: vi.fn(), delete: vi.fn() }`)
  — assert it rejects oversized/disallowed files and prefixes the key with the
  org id.
- Manual: `pnpm dev`, POST a small PNG to `/api/uploads`, open the returned URL.

## Reference files

- `references/uploads-service.ts`
- `references/uploads-controller.ts`
- `references/items-schema-patch.md`
