// /api/uploads — accept a multipart file upload, store it in R2, return a URL.
// Copy to: workers/api/controllers/uploads-controller.ts
import { Hono } from "hono";
import { ValidationError } from "../services/errors";
import type { ApiEnv } from "../types";

export function createUploadsController() {
  const app = new Hono<ApiEnv>();

  app.post("/", async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("expected a 'file' field");
    }

    const { key, url } = await c.var.services.uploads.put(c.var.orgId, {
      filename: file.name,
      contentType: file.type,
      size: file.size,
      body: file.stream(),
    });

    return c.json({ key, url }, 201);
  });

  app.delete("/:key{.+}", async (c) => {
    await c.var.services.uploads.delete(c.var.orgId, c.req.param("key"));
    return c.json({ ok: true });
  });

  return app;
}
