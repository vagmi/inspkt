// /api/public — consumed by the embeddable widget (and any unauthenticated
// client). No Clerk session; CORS wide open so it works from any site.
// Copy to: workers/api/controllers/public-controller.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { injectServices } from "../middleware/services";
import type { ApiEnv } from "../types";

export function createPublicController() {
  const app = new Hono<ApiEnv>();

  app.use(
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "OPTIONS"],
      maxAge: 86_400,
    }),
  );
  app.use(injectServices);

  // Public read by id. The id is the capability — return only fields a
  // respondent/visitor may see (never org ids or internal columns).
  app.get("/items/:id", async (c) => {
    const item = await c.var.services.items.getPublic(c.req.param("id"));
    return c.json({ name: item.name, description: item.description });
  });

  return app;
}
