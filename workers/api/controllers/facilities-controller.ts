import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { can } from "~/lib/capabilities";
import { requireCapability } from "../middleware/auth";
import type { ApiEnv } from "../types";
import { facilityCreateSchema, facilityUpdateSchema } from "../validation";

/** /api/facilities — CRUD for the sites that get inspected. Reads are open to
 * any member; writes are setup actions (admin/manager) gated by can.setup. */
export function createFacilitiesController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const facilities = await c.var.services.facilities.list(c.var.orgId);
    return c.json({ facilities });
  });

  app.post(
    "/",
    requireCapability(can.setup),
    zValidator("json", facilityCreateSchema),
    async (c) => {
      const facility = await c.var.services.facilities.create(
        c.var.orgId,
        c.var.org.plan,
        c.req.valid("json"),
      );
      return c.json({ facility }, 201);
    },
  );

  app.get("/:id", async (c) => {
    const facility = await c.var.services.facilities.get(
      c.var.orgId,
      c.req.param("id"),
    );
    return c.json({ facility });
  });

  app.patch(
    "/:id",
    requireCapability(can.setup),
    zValidator("json", facilityUpdateSchema),
    async (c) => {
      const facility = await c.var.services.facilities.update(
        c.var.orgId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      return c.json({ facility });
    },
  );

  app.delete("/:id", requireCapability(can.setup), async (c) => {
    await c.var.services.facilities.delete(c.var.orgId, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
