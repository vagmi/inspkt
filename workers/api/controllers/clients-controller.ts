import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { can } from "~/lib/capabilities";
import { requireCapability } from "../middleware/auth";
import type { ApiEnv } from "../types";
import { clientCreateSchema, clientUpdateSchema } from "../validation";

/** /api/clients — CRUD for the org's clients. Reads are open to any member;
 * writes are setup actions (admin/manager) gated by can.setup. */
export function createClientsController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const clients = await c.var.services.clients.list(c.var.orgId);
    return c.json({ clients });
  });

  app.post(
    "/",
    requireCapability(can.setup),
    zValidator("json", clientCreateSchema),
    async (c) => {
      const client = await c.var.services.clients.create(
        c.var.orgId,
        c.req.valid("json"),
      );
      return c.json({ client }, 201);
    },
  );

  app.get("/:id", async (c) => {
    const client = await c.var.services.clients.get(
      c.var.orgId,
      c.req.param("id"),
    );
    return c.json({ client });
  });

  app.patch(
    "/:id",
    requireCapability(can.setup),
    zValidator("json", clientUpdateSchema),
    async (c) => {
      const client = await c.var.services.clients.update(
        c.var.orgId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      return c.json({ client });
    },
  );

  app.delete("/:id", requireCapability(can.setup), async (c) => {
    await c.var.services.clients.delete(c.var.orgId, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
