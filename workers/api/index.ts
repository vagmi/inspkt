import { clerkMiddleware } from "@clerk/hono";
import { Hono } from "hono";
import { domainErrorHandler } from "./controllers/error-handler";
import { createIntegrationsController } from "./controllers/integrations-controller";
import { createItemsController } from "./controllers/items-controller";
import { createMembersController } from "./controllers/members-controller";
import { requireOrg } from "./middleware/auth";
import { injectServices } from "./middleware/services";
import type { ApiEnv } from "./types";

/**
 * The API app. Mounted under /api by workers/app.ts and invoked in-process
 * by React Router loaders/actions via app/lib/api-client.server.ts.
 *
 * Route groups:
 *  - /api/integrations/*   signature-verified receivers (Clerk; the
 *                          billing-polar skill adds the Polar receiver)
 *  - everything else       Clerk session + active org required
 *
 * REGISTRATION ORDER MATTERS: public routes and receivers must be registered
 * BEFORE the authed group so they match first and never hit requireOrg.
 * (The widget-embed skill adds a /api/public group here.)
 */
export function createApi() {
  const app = new Hono<ApiEnv>().basePath("/api");
  app.onError(domainErrorHandler);

  app.get("/health", (c) => c.json({ ok: true }));

  // ---- Receiver routes (registered first; no Clerk session) ----
  app.route("/integrations", createIntegrationsController());

  // ---- Authenticated dashboard routes ----
  const authed = new Hono<ApiEnv>();
  authed.use(clerkMiddleware());
  authed.use(injectServices);
  authed.use(requireOrg);

  authed.get("/me", (c) =>
    c.json({
      orgId: c.var.orgId,
      org: c.var.org,
      userId: c.var.userId,
      user: c.var.user,
      orgRole: c.var.orgRole,
      membership: c.var.membership,
    }),
  );
  authed.route("/items", createItemsController());
  authed.route("/members", createMembersController());

  app.route("/", authed);

  return app;
}

export type Api = ReturnType<typeof createApi>;
