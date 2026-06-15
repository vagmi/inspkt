# API access (machine API keys)

Organizations can mint **API keys** for headless access to the write API —
scripting setup, bulk imports, CI jobs. A key authenticates as a
**manager-equivalent** actor scoped to its org.

## What a key can / can't do
- **Can:** full CRUD on the org's data the setup role owns — clients,
  facilities, equipment, equipment types, forms (create / update / delete) — and
  read everything in the org.
- **Can't:** manage members, change roles, manage billing, or rename/delete the
  org. It also **cannot mint or revoke API keys** (that's human-admin only).

This mirrors the app-owned capability model exactly: a key sets `c.var.role =
"manager"`, so every existing `requireCapability(can.setup)` gate applies
unchanged. See `app/lib/capabilities.ts`.

## Creating a key
Admins only, from **`/app/api-keys`** (or `POST /api/api-keys` with a Clerk
session). The full token is shown **exactly once** at creation — store it
immediately. We keep only a hash and can't show it again.

Token format: `inspkt_` + 64 hex chars.

## Using a key
Send it as a Bearer token to any `/api/*` write route:

```sh
curl -X POST https://inspkt.vagmi-mudumbai.workers.dev/api/clients \
  -H "Authorization: Bearer inspkt_<your-key>" \
  -H "content-type: application/json" \
  -d '{"name":"Acme Properties","contactEmail":"ops@acme.com"}'
```

The same key works for `/api/equipment-types`, `/api/forms`, `/api/equipment`,
`/api/facilities`, etc. Reads (`GET`) work too.

## Revoking
From `/app/api-keys`, or `DELETE /api/api-keys/:id` (admin + Clerk session).
A revoked key stops authenticating immediately.

## Security model
- **Hashed, not encrypted.** We store `HMAC-SHA256(API_KEY_PEPPER, token)` (a
  unique, indexed column) and a non-secret display `prefix`. A DB leak yields no
  usable keys. The token is never persisted in plaintext.
- **`API_KEY_PEPPER`** is a server secret (env). It is **permanent** — rotating
  it invalidates every existing key. Set it once:
  - Local: a value in `.dev.vars` (already added).
  - Prod: `wrangler secret put API_KEY_PEPPER` before keys are created.
- **Lookup** is one indexed query by hash; the row carries the org, so the key
  alone establishes tenancy. No per-org salt (high-entropy random tokens don't
  need one, and it would break O(1) lookup).
- **`last_used_at`** is stamped on use (throttled to ~once/minute).
- Optional `expires_at` is supported at the data layer (no UI yet).

## Implementation map
- Schema: `workers/api/db/schema/api-keys.ts` (migration `0014`)
- Crypto: `workers/api/lib/api-keys-crypto.ts`
- Repo / service: `workers/api/repositories/api-keys-repo.ts`,
  `workers/api/services/api-keys-service.ts`
- Auth: `requireOrgOrApiKey` + `requireHuman` in `workers/api/middleware/auth.ts`
- Controller: `workers/api/controllers/api-keys-controller.ts` (`/api/api-keys`)
- UI: `app/routes/app/api-keys.tsx`
