import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { can } from "~/lib/capabilities";
import { requireCapability } from "../middleware/auth";
import type { ApiEnv } from "../types";
import { equipmentCreateSchema, equipmentUpdateSchema } from "../validation";

/** /api/equipment — CRUD for the inspectable assets. Reads are open to any
 * member (optionally filtered by ?facilityId=); writes are gated by can.setup. */
export function createEquipmentController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const facilityId = c.req.query("facilityId");
    const equipment = facilityId
      ? await c.var.services.equipment.listByFacility(c.var.orgId, facilityId)
      : await c.var.services.equipment.list(c.var.orgId);
    return c.json({ equipment });
  });

  app.post(
    "/",
    requireCapability(can.setup),
    zValidator("json", equipmentCreateSchema),
    async (c) => {
      const item = await c.var.services.equipment.create(
        c.var.orgId,
        c.req.valid("json"),
      );
      return c.json({ equipment: item }, 201);
    },
  );

  app.get("/:id", async (c) => {
    const item = await c.var.services.equipment.get(
      c.var.orgId,
      c.req.param("id"),
    );
    return c.json({ equipment: item });
  });

  app.patch(
    "/:id",
    requireCapability(can.setup),
    zValidator("json", equipmentUpdateSchema),
    async (c) => {
      const item = await c.var.services.equipment.update(
        c.var.orgId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      return c.json({ equipment: item });
    },
  );

  app.delete("/:id", requireCapability(can.setup), async (c) => {
    await c.var.services.equipment.delete(c.var.orgId, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
