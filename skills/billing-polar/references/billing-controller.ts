// Copy to workers/api/controllers/billing-controller.ts.
import { Hono } from "hono";
import type { ApiEnv } from "../types";

/** /api/billing — plan state, checkout and portal redirects (authed). */
export function createBillingController() {
  const app = new Hono<ApiEnv>();

  app.get("/state", async (c) => {
    const state = await c.var.services.billing.state(c.var.org);
    return c.json({ state });
  });

  // GET so a plain <a href> can start the upgrade.
  app.get("/checkout", async (c) => {
    const plan = c.req.query("plan") ?? "pro";
    const successUrl = `${new URL(c.req.url).origin}/app/billing?upgraded=1`;
    const url = await c.var.services.billing.checkoutUrl(
      c.var.orgId,
      plan,
      successUrl,
    );
    return c.redirect(url, 302);
  });

  app.get("/portal", async (c) => {
    const url = await c.var.services.billing.portalUrl(c.var.orgId);
    return c.redirect(url, 302);
  });

  // Called on return from checkout: sync state directly from Polar in case
  // the subscription webhook hasn't landed (or was missed).
  app.post("/reconcile", async (c) => {
    const applied = await c.var.services.billing.reconcile(c.var.orgId);
    return c.json({ applied });
  });

  return app;
}
