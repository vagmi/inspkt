// /api/webhooks — manage outbound webhook endpoints (authed group).
// Copy to: workers/api/controllers/webhooks-controller.ts
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../types";

const createSchema = z.object({
  url: z.string().url(),
  description: z.string().max(200).optional(),
});

export function createWebhooksController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const endpoints = await c.var.services.webhooks.list(c.var.orgId);
    return c.json({ endpoints });
  });

  app.post("/", zValidator("json", createSchema), async (c) => {
    const endpoint = await c.var.services.webhooks.create(
      c.var.org,
      c.req.valid("json"),
    );
    return c.json({ endpoint }, 201);
  });

  app.delete("/:id", async (c) => {
    await c.var.services.webhooks.delete(c.var.orgId, c.req.param("id"));
    return c.json({ ok: true });
  });

  app.get("/:id/secret", async (c) => {
    const secret = await c.var.services.webhooks.getSecret(
      c.var.orgId,
      c.req.param("id"),
    );
    return c.json({ secret });
  });

  app.get("/:id/deliveries", async (c) => {
    const deliveries = await c.var.services.webhooks.listDeliveries(
      c.var.orgId,
      c.req.param("id"),
    );
    return c.json({ deliveries });
  });

  return app;
}
