import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { can } from "~/lib/capabilities";
import { requireCapability, requireHuman } from "../middleware/auth";
import type { ApiEnv } from "../types";
import { apiKeyCreateSchema } from "../validation";

/** A key as shown in management responses — never includes the secret. */
function publicKey(k: {
  id: string;
  name: string;
  prefix: string;
  createdByUserId: string;
  lastUsedAt: number | null;
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    createdByUserId: k.createdByUserId,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    revokedAt: k.revokedAt,
    createdAt: k.createdAt,
  };
}

/** /api/api-keys — manage machine API keys. Human-only (a key cannot mint or
 * revoke keys) and admin-gated. The plaintext token is returned exactly once,
 * on create. */
export function createApiKeysController() {
  const app = new Hono<ApiEnv>();

  // Every route is human + admin.
  app.use(requireHuman);
  app.use(requireCapability(can.manageApiKeys));

  app.get("/", async (c) => {
    const keys = await c.var.services.apiKeys.list(c.var.orgId);
    return c.json({ keys: keys.map(publicKey) });
  });

  app.post("/", zValidator("json", apiKeyCreateSchema), async (c) => {
    const { apiKey, token } = await c.var.services.apiKeys.create(
      c.var.orgId,
      c.var.userId,
      c.req.valid("json"),
    );
    // `token` is the ONLY time the plaintext is ever returned.
    return c.json({ apiKey: publicKey(apiKey), token }, 201);
  });

  app.delete("/:id", async (c) => {
    await c.var.services.apiKeys.revoke(c.var.orgId, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
