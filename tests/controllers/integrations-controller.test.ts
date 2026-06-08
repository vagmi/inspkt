import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createIntegrationsController } from "../../workers/api/controllers/integrations-controller";
import type { ApiEnv } from "../../workers/api/types";

function makeApp(opts: { clerkOk?: boolean } = {}) {
  const organizations = { syncFromClerk: vi.fn() };

  const clerkEvent = { type: "organization.updated", data: { id: "org_1" } };

  const controller = createIntegrationsController({
    clerk: (opts.clerkOk ?? true)
      ? () => clerkEvent
      : () => {
          throw new Error("bad signature");
        },
  });

  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("services", { organizations } as never);
    await next();
  });
  app.route("/integrations", controller);
  return { app, organizations, clerkEvent };
}

const TEST_ENV = {
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
