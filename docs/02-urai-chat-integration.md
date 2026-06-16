# Urai chat widget — setup assistant (plan)

Integrate `@uraiai/chat-widget-*` (v0.1.0, github: uraiai/urai-chat-sdk) as an
app-wide **right-side vertical flyout** that helps admins/managers set up
operations (clients → facilities → equipment, equipment types, forms) by
talking to an assistant. The assistant's UraiJS tools (`ai_tools/`, split by
domain) call our existing `/api/*` write routes.

Reference checkouts (read-only, gitignored): `references/urai-chat-sdk` @ v0.1.0
and `references/example-tool.ts` (the canonical `@tool` authoring format).

## Trust model (decided: per-thread token via vars)

`meta.secrets` is per-widget (one value in the Urai dashboard), so it can't carry
per-org tenancy. We instead mint a **short-lived org-scoped token** server-side
and pass it through `vars`; the UraiJS tool sends it as a Bearer token and our
API verifies it. Because `vars` are browser-visible and stored on the Urai
thread, the token must be:

- **Signed + self-describing.** Carries `{ orgId, role:"manager", exp }`, signed
  HMAC-SHA256 with a server secret. orgId comes from the *signed* payload, never
  from a separate vars field — a user cannot swap orgs by editing vars.
- **Short-lived.** ~15–30 min; refreshed client-side. Limits the leak window
  (browser + thread storage).
- **Setup-scoped.** Maps to `role:"manager"`, so existing
  `requireCapability(can.setup)` gates apply unchanged — and it inherently
  *cannot* manage members, roles, billing, the org, or API keys (those are
  admin + `requireHuman`).

Our API never trusts `vars` for authorization — it re-verifies the token
signature on every request.

### Embed → tool contract (matches `references/example-tool.ts`)

The embed passes `vars.metadata = { _widget_token, org_id }` (and `route`). The
platform injects `_chat_log_id`. The tools read:

| In UraiJS | Source | Used for |
|---|---|---|
| `meta.vars.metadata._widget_token` | embed (our `inspktw_` token) | `Authorization: Bearer …` |
| `meta.vars.metadata.org_id` | embed | context (org is also baked into the token) |
| `meta.vars.metadata._chat_log_id` | platform | `meta.urai.sendCommand(id, …)` |
| `meta.secrets.URAI_API_HOST` | Urai dashboard secret | the inspkt API base the tools fetch |

`sendCommand` payload is `{ type: "navigate", payload: { path } }`; the widget's
`onCommand` validates it and only follows in-app (`/app…`) paths.

## New server secret / env vars

Add to `workers/env.d.ts`, `.dev.vars.example`, and `.dev.vars`:

| Var | Where used | Notes |
|---|---|---|
| `URAI_CHAT_BASE` | widget `baseUrl` (browser) | default `https://chat.app.urai.dev`; local `http://localhost:5174` |
| `URAI_WIDGET_TOKEN` | widget `widgetToken` (browser) | public widget token from Urai dashboard |
| `WIDGET_TOKEN_SECRET` | sign/verify `inspktw_` tokens (server) | rotating it invalidates all live widget tokens |

The inspkt API base the tools call is **not** an inspkt env var — it's the
`URAI_API_HOST` secret configured on the Urai side (`meta.secrets`).
Note: when the chat-service runs locally (`:5174`) it must be able to reach our
dev server (`URAI_API_HOST=http://localhost:5173`); if chat-service is containerized,
`localhost` won't resolve to the host — use a host-reachable URL.

## Work breakdown

### 1. Widget session token (`inspktw_…`)
- `workers/api/lib/widget-token.ts`: `mintWidgetToken(secret, {orgId, role, ttl})`
  and `verifyWidgetToken(secret, token)` using Web Crypto HMAC-SHA256 (mirror
  the style of `api-keys-crypto.ts`; compact `inspktw_<b64url payload>.<b64url sig>`,
  no JWT lib). Constant-time compare; check `exp`.
- Extend `requireOrgOrApiKey` in `workers/api/middleware/auth.ts` to recognize
  `Bearer inspktw_`: verify → set `orgId`, `role:"manager"`, `authMethod:"widget"`,
  and load `c.var.org` (add `organizations.get(orgId)` if not present). Register
  the branch alongside the existing `inspkt_` branch.
- Resource route `app/routes/app/urai-token.ts` (action/loader) — for a
  `can.setup` user, mint and return `{ token, exp }`. Used for the initial mint
  and periodic refresh.

### 2. Embed the widget (app-wide right flyout)
- Add dependency on `@uraiai/chat-widget-react` (+ its `@uraiai/chat-widget-core`).
  **Open decision — dependency sourcing (see below).**
- `app/routes/app/layout.tsx`:
  - loader: if `can.setup`, read env (`URAI_CHAT_BASE`, `URAI_WIDGET_TOKEN`,
    `APP_URL`), mint a widget token, return them + the Clerk `userId` + `orgId`.
  - component: a fixed right-hand panel, full viewport height, slide in/out
    (collapsed by default), toggled from the header. Render
    `<UraiChatWidget mode="inline" style={{height:"100%"}}
      baseUrl={uraiChatBase} widgetToken={uraiWidgetToken}
      userId={userId}
      vars={{ metadata: { _widget_token, org_id }, route: pathname }}
      onCommand={...} />`.
  - Update `vars` on route change (prop is deep-compared, cheap).
  - Refresh the token before `exp` via the resource route (re-fetch `/app/urai-token`).
  - `onCommand`: validate untrusted payload; support `{type:"navigate", payload:{path}}`
    where `path` is a relative `/app/...` path → react-router `navigate`.
- Gate the flyout on `can.setup` (inspectors don't get the setup assistant).

### 3. UraiJS tools (`ai_tools/`, `@tool` format)
Authored here as source of truth; deployed to Urai out-of-band. WinterTC,
`fetch`-only. Format follows `references/example-tool.ts`: `@tool`-decorated
`static async` methods on a class, with JSDoc on each method + arg interface —
those JSDoc comments are parsed into `declarations.ts` (**auto-generated; we do
not write it**). Each tool file imports `./declarations` (boilerplate) so the
decorators are retained.

Layout (relative imports):
- `lib/api.ts` — `apiFetch(method, path, body)` (Bearer
  `meta.vars.metadata._widget_token`, base `meta.secrets.URAI_API_HOST`),
  `navigate(path)` (→ `sendCommand(_chat_log_id, {type:"navigate", payload})`),
  `clean()`.
- `clients.ts`, `facilities.ts`, `equipment-types.ts`, `equipment.ts`,
  `forms.ts` — one `@tool` class each. `tools.ts` is a barrel that re-exports
  them.

Tools (mirror request shapes in `workers/api/validation.ts`):
- `list_clients`, `create_client`
- `list_facilities` (by client), `create_facility`
- `list_equipment_types`, `create_equipment_type` (with custom-field schema)
- `list_equipment`, `create_equipment` (metadata validated by its type)
- `list_forms`, `create_form` (the PDF / described-fields → form flow),
  `update_checkpoint` (adjust a numeric range / rating threshold — see §5),
  `attach_form_to_type`
- After a successful create, `navigate(...)` takes the user to the new record.

Reads are included so the assistant can look up existing data (and avoid
duplicates) before writing.

### 4. Tests / typecheck
- Unit-test `widget-token.ts` (round-trip, tamper, expiry).
- Auth-middleware test: a valid `inspktw_` token hits a `can.setup` route (200)
  and is blocked from an admin/`requireHuman` route (403).
- `pnpm typecheck` + `pnpm build` green. (`ai_tools/` is excluded from our
  tsconfig — it targets UraiJS, not our build.)

### 5. Granular form-field editing (read-merge-update)
Rather than changing the schema, edit one checkpoint in place:
- `PATCH /api/forms/:id/checkpoints/:checkpointId` (`can.setup`).
- `forms-service.updateCheckpoint` reads the form, merges the patch onto the
  target checkpoint, **revalidates the merged result against `checkpointSchema`**
  (so numeric/rating coherence holds), then writes one atomic `UPDATE` via
  `formsRepo.updateCheckpoint` — the checkpoint **id is preserved** (inspections
  reference it). D1 has no interactive transactions; a single-row UPDATE is
  atomic on its own. Incoherent edits → `ValidationError` (422).
- The `update_checkpoint` tool reads the current config and merges only the
  range fields passed, so the assistant can "set okMax to 50" without resending
  the whole config.

## Dependency sourcing — resolved: npm

`github:uraiai/urai-chat-sdk#v0.1.0` is **not** installable: it's a pnpm
monorepo, and a git URL resolves the repo *root* (`"private": true`, exports
nothing); there's no subpackage selection, the published `dist` isn't committed,
and `chat-widget-react`'s `workspace:^` core dep is unresolvable standalone.

We depend on `@uraiai/chat-widget-react` from **npm** (it pulls
`@uraiai/chat-widget-core` transitively). To move fast on fixes, publish patch
releases and bump here. `references/urai-chat-sdk` stays as a read-only
reference checkout (gitignored).

**v0.1.1 (current):** the widget now renders **tool traces natively** (from
`tool_call_started` SSE events) and supports **attachments** (a composer attach
button + `uploadAttachment`, for multimodal chat). Both live entirely in
`chat-widget-core`'s UI — the React package API is unchanged, so the upgrade is
a version bump only. Because the widget shows tool progress itself, we removed
our earlier hand-rolled activity strip and the `{type:"tool"}` `sendCommand`
the tools emitted (the navigation command is unchanged).

## Status — shipped (local), 2026-06-15

All of the breakdown above is implemented; `pnpm typecheck`, `pnpm build`, and
`pnpm test` (247) are green. Remaining to go live:
- Set `URAI_WIDGET_TOKEN` (Urai dashboard) + a prod `WIDGET_TOKEN_SECRET`
  (`wrangler secret put`), and `URAI_CHAT_BASE` if not the hosted default.
- On the Urai side, set the `URAI_API_HOST` secret to the inspkt API origin and
  add the app origin to the widget's **allowed origins**.
- Upload `ai_tools/` to the widget's UraiJS tools (the `@tool` JSDoc generates
  `declarations.ts`); confirm the embed surfaces our token as
  `meta.vars.metadata._widget_token` and the platform injects `_chat_log_id`.
