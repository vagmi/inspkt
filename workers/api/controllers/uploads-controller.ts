// /api/uploads — store and serve inspection photos from a PRIVATE R2 bucket.
// Mounted inside the authed group, so every request already carries a valid
// Clerk session + active org (c.var.orgId). The service additionally checks the
// org prefix on the key, so a member of org A can never read org B's objects.
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

    const { key } = await c.var.services.uploads.put(c.var.orgId, {
      filename: file.name,
      contentType: file.type,
      size: file.size,
      body: file.stream(),
    });

    // The client stores the key and renders it via GET /api/uploads/<key>.
    return c.json({ key }, 201);
  });

  // Authenticated read: stream the object to a member of the owning org.
  app.get("/:key{.+}", async (c) => {
    const object = await c.var.services.uploads.get(
      c.var.orgId,
      c.req.param("key"),
    );
    if (!object) return c.json({ error: "not found" }, 404);

    return new Response(object.body, {
      headers: {
        "content-type":
          object.httpMetadata?.contentType ?? "application/octet-stream",
        // private: scoped to this session; safe for the browser to cache but
        // not shared caches/CDNs.
        "cache-control": "private, max-age=3600",
        etag: object.httpEtag,
      },
    });
  });

  app.delete("/:key{.+}", async (c) => {
    await c.var.services.uploads.delete(c.var.orgId, c.req.param("key"));
    return c.json({ ok: true });
  });

  return app;
}
