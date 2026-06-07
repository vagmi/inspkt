import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createIntegrationsController } from "../../workers/api/controllers/integrations-controller";
import type { ApiEnv } from "../../workers/api/types";
import { mockBillingService } from "../helpers/mocks";

function makeApp(opts: { polarOk?: boolean; clerkOk?: boolean } = {}) {
  const billing = mockBillingService();
  const organizations = { syncFromClerk: vi.fn() };

  const polarEvent = { type: "subscription.active", data: { id: "sub_1" } };
  const clerkEvent = { type: "organization.updated", data: { id: "org_1" } };

  const controller = createIntegrationsController({
    polar: (opts.polarOk ?? true)
      ? () => polarEvent
      : () => {
          throw new Error("bad signature");
        },
    clerk: (opts.clerkOk ?? true)
      ? () => clerkEvent
      : () => {
          throw new Error("bad signature");
        },
  });

  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("services", { billing, organizations } as never);
    await next();
  });
  app.route("/integrations", controller);
  return { app, billing, organizations, polarEvent, clerkEvent };
}

const TEST_ENV = {
  POLAR_WEBHOOK_SECRET: "polar_whs_test",
  CLERK_WEBHOOK_SECRET: "whsec_test",
} as unknown as Env;

function post(path: string) {
  return [
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    },
    TEST_ENV,
  ] as const;
}

describe("integrations controller", () => {
  it("forwards verified polar events to the billing service", async () => {
    const { app, billing, polarEvent } = makeApp();
    const res = await app.request(...post("/integrations/polar"));
    expect(res.status).toBe(200);
    expect(billing.handlePolarEvent).toHaveBeenCalledWith(polarEvent);
  });

  it("403s polar events with bad signatures", async () => {
    const { app, billing } = makeApp({ polarOk: false });
    const res = await app.request(...post("/integrations/polar"));
    expect(res.status).toBe(403);
    expect(billing.handlePolarEvent).not.toHaveBeenCalled();
  });

  it("forwards verified clerk events to the organizations service", async () => {
    const { app, organizations, clerkEvent } = makeApp();
    const res = await app.request(...post("/integrations/clerk"));
    expect(res.status).toBe(200);
    expect(organizations.syncFromClerk).toHaveBeenCalledWith(clerkEvent);
  });

  it("403s clerk events with bad signatures", async () => {
    const { app, organizations } = makeApp({ clerkOk: false });
    const res = await app.request(...post("/integrations/clerk"));
    expect(res.status).toBe(403);
    expect(organizations.syncFromClerk).not.toHaveBeenCalled();
  });
});
