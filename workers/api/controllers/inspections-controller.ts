import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { ApiEnv } from "../types";
import {
  inspectionCreateSchema,
  inspectionSaveSchema,
} from "../validation";

/** /api/inspections — capture lifecycle. The inspector is taken from the
 * session (c.var.userId), never the client. Drafts are saved with PATCH;
 * POST /:id/submit finalizes (and runs the verdict engine from Phase 4). */
export function createInspectionsController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const inspections = await c.var.services.inspections.list(c.var.orgId);
    return c.json({ inspections });
  });

  app.post("/", zValidator("json", inspectionCreateSchema), async (c) => {
    const inspection = await c.var.services.inspections.create(
      c.var.orgId,
      c.var.userId,
      c.req.valid("json"),
    );
    return c.json({ inspection }, 201);
  });

  app.get("/:id", async (c) => {
    const inspection = await c.var.services.inspections.get(
      c.var.orgId,
      c.req.param("id"),
    );
    return c.json({ inspection });
  });

  app.patch("/:id", zValidator("json", inspectionSaveSchema), async (c) => {
    const inspection = await c.var.services.inspections.saveDraft(
      c.var.orgId,
      c.req.param("id"),
      c.req.valid("json").observations,
    );
    return c.json({ inspection });
  });

  app.post(
    "/:id/submit",
    zValidator("json", inspectionSaveSchema),
    async (c) => {
      const inspection = await c.var.services.inspections.submit(
        c.var.orgId,
        c.req.param("id"),
        c.req.valid("json").observations,
      );
      return c.json({ inspection });
    },
  );

  app.delete("/:id", async (c) => {
    await c.var.services.inspections.delete(c.var.orgId, c.req.param("id"));
    return c.json({ ok: true });
  });

  return app;
}
