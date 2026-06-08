import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createIntegrationsController } from "../../workers/api/controllers/integrations-controller";
import type { ApiEnv } from "../../workers/api/types";

function makeApp(opts: { clerkOk?: boolean; event?: { type: string } } = {}) {
  const organizations = { syncFromClerk: vi.fn() };
  const users = { syncFromClerk: vi.fn() };
  const members = { syncFromClerk: vi.fn() };

  const clerkEvent = opts.event ?? {
    type: "organization.updated",
    data: { id: "org_1" },
  };

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
    c.set("services", { organizations, users, members } as never);
    await next();
  });
  app.route("/integrations", controller);
  return { app, organizations, users, members, clerkEvent };
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

describe("integrations controller — clerk dispatch", () => {
  it("routes organization.* to the organizations service", async () => {
    const { app, organizations, users, members, clerkEvent } = makeApp();
    const res = await app.request(...post("/integrations/clerk"));
    expect(res.status).toBe(200);
    expect(organizations.syncFromClerk).toHaveBeenCalledWith(clerkEvent);
    expect(users.syncFromClerk).not.toHaveBeenCalled();
    expect(members.syncFromClerk).not.toHaveBeenCalled();
  });

  it("routes user.* to the users service", async () => {
    const event = { type: "user.created", data: { id: "user_1" } };
    const { app, users, organizations } = makeApp({ event });
    await app.request(...post("/integrations/clerk"));
    expect(users.syncFromClerk).toHaveBeenCalledWith(event);
    expect(organizations.syncFromClerk).not.toHaveBeenCalled();
  });

  it("routes organizationMembership.* to the members service (not organizations)", async () => {
    const event = { type: "organizationMembership.created", data: {} };
    const { app, members, organizations } = makeApp({ event });
    await app.request(...post("/integrations/clerk"));
    expect(members.syncFromClerk).toHaveBeenCalledWith(event);
    expect(organizations.syncFromClerk).not.toHaveBeenCalled();
  });

  it("403s clerk events with bad signatures", async () => {
    const { app, organizations } = makeApp({ clerkOk: false });
    const res = await app.request(...post("/integrations/clerk"));
    expect(res.status).toBe(403);
    expect(organizations.syncFromClerk).not.toHaveBeenCalled();
  });
});
