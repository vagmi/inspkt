import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiEnv } from "../types";
import { itemCreateSchema, itemUpdateSchema } from "../validation";

/** /api/items — CRUD. Mounted inside the authed group, so
 * c.var.{orgId,org,services} are always present. Controllers stay thin:
 * validate input, call a service, shape the JSON response. Copy this file
 * when you add your own resource. */
export function createItemsController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const items = await c.var.services.items.list(c.var.orgId);
    return c.json({ items });
  });

  app.post("/", zValidator("json", itemCreateSchema), async (c) => {
    const input = c.req.valid("json");
    const item = await c.var.services.items.create(
      c.var.orgId,
      c.var.org.plan,
      input,
    );
    return c.json({ item }, 201);
  });

  app.get("/:id", async (c) => {
    const item = await c.var.services.items.get(c.var.orgId, c.req.param("id"));
    return c.json({ item });
  });

  app.patch("/:id", zValidator("json", itemUpdateSchema), async (c) => {
    const item = await c.var.services.items.update(
      c.var.orgId,
      c.req.param("id"),
      c.req.valid("json"),
    );
    return c.json({ item });
  });

  app.delete("/:id", async (c) => {
    await c.var.services.items.delete(c.var.orgId, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
