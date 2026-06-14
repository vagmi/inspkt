import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { can } from "~/lib/capabilities";
import { requireCapability } from "../middleware/auth";
import type { ApiEnv } from "../types";
import {
  equipmentTypeCreateSchema,
  equipmentTypeUpdateSchema,
} from "../validation";

/** /api/equipment-types — CRUD for the equipment taxonomy. Reads are open to
 * any member; writes are setup actions gated by can.setup. */
export function createEquipmentTypesController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const types = await c.var.services.equipmentTypes.list(c.var.orgId);
    return c.json({ types });
  });

  app.post(
    "/",
    requireCapability(can.setup),
    zValidator("json", equipmentTypeCreateSchema),
    async (c) => {
      const type = await c.var.services.equipmentTypes.create(
        c.var.orgId,
        c.req.valid("json"),
      );
      return c.json({ type }, 201);
    },
  );

  app.get("/:id", async (c) => {
    const type = await c.var.services.equipmentTypes.get(
      c.var.orgId,
      c.req.param("id"),
    );
    return c.json({ type });
  });

  app.patch(
    "/:id",
    requireCapability(can.setup),
    zValidator("json", equipmentTypeUpdateSchema),
    async (c) => {
      const type = await c.var.services.equipmentTypes.update(
        c.var.orgId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      return c.json({ type });
    },
  );

  app.delete("/:id", requireCapability(can.setup), async (c) => {
    await c.var.services.equipmentTypes.delete(c.var.orgId, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
