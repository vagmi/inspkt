import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { can } from "~/lib/capabilities";
import { requireCapability } from "../middleware/auth";
import type { ApiEnv } from "../types";
import { formCreateSchema, formUpdateSchema } from "../validation";

/** /api/forms — CRUD for inspection forms (the reusable rubrics). Checkpoints
 * travel inside the form payload as an ordered array; the repo reconciles
 * them so unchanged checkpoint ids stay stable across edits. */
export function createFormsController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const forms = await c.var.services.forms.list(c.var.orgId);
    return c.json({ forms });
  });

  app.post(
    "/",
    requireCapability(can.setup),
    zValidator("json", formCreateSchema),
    async (c) => {
      const form = await c.var.services.forms.create(
        c.var.orgId,
        c.req.valid("json"),
      );
      return c.json({ form }, 201);
    },
  );

  app.get("/:id", async (c) => {
    const form = await c.var.services.forms.get(c.var.orgId, c.req.param("id"));
    return c.json({ form });
  });

  app.patch(
    "/:id",
    requireCapability(can.setup),
    zValidator("json", formUpdateSchema),
    async (c) => {
      const form = await c.var.services.forms.update(
        c.var.orgId,
        c.req.param("id"),
        c.req.valid("json"),
      );
      return c.json({ form });
    },
  );

  app.delete("/:id", requireCapability(can.setup), async (c) => {
    await c.var.services.forms.delete(c.var.orgId, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
