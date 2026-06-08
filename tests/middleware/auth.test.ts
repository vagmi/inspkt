import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { describe, expect, it, vi } from "vitest";
import { can } from "../../app/lib/capabilities";
import {
  requireCapability,
  requireOrg,
} from "../../workers/api/middleware/auth";
import type { ApiEnv } from "../../workers/api/types";
import { fakeMembership, fakeOrg, fakeUser } from "../helpers/mocks";

interface StubAuth {
  userId?: string | null;
  orgId?: string | null;
  orgRole?: string | null;
  has?: (p: { role?: string; permission?: string }) => boolean;
}

/** Mimics what @clerk/hono's clerkMiddleware sets on the context. */
function stubClerk(auth: StubAuth | null) {
  return createMiddleware(async (c, next) => {
    c.set("clerkAuth", (() => auth) as never);
    c.set("clerk", {
      organizations: { getOrganization: vi.fn() },
      users: {
        getUser: vi
          .fn()
          .mockResolvedValue({ emailAddresses: [], firstName: null }),
      },
    } as never);
    await next();
  });
}

function makeApp(auth: StubAuth | null) {
  const ensureOrg = vi.fn().mockResolvedValue(fakeOrg());
  const ensureUser = vi.fn().mockResolvedValue(fakeUser());
  const ensureMembership = vi.fn().mockResolvedValue(fakeMembership());

  const app = new Hono<ApiEnv>();
  app.use(stubClerk(auth));
  app.use(async (c, next) => {
    c.set("services", {
      organizations: { ensureOrg, getById: vi.fn() },
      users: { ensureUser },
      members: { ensureMembership },
    } as never);
    await next();
  });
  app.use(requireOrg);
  app.get("/probe", (c) =>
    c.json({
      orgId: c.var.orgId,
      userId: c.var.userId,
      orgRole: c.var.orgRole,
      role: c.var.membership.role,
    }),
  );
  return { app, ensureOrg, ensureUser, ensureMembership };
}

describe("requireOrg middleware", () => {
  it("401s without a signed-in user", async () => {
    const { app } = makeApp(null);
    expect((await app.request("/probe")).status).toBe(401);
  });

  it("403s when signed in but no active organization", async () => {
    const { app } = makeApp({ userId: "user_1", orgId: null });
    expect((await app.request("/probe")).status).toBe(403);
  });

  it("mirrors org, user and membership and exposes session role", async () => {
    const { app, ensureUser, ensureMembership } = makeApp({
      userId: "user_1",
      orgId: "org_42",
      orgRole: "org:admin",
    });

    const res = await app.request("/probe");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      orgId: string;
      userId: string;
      orgRole: string;
    };
    expect(body.orgId).toBe("org_42");
    expect(body.userId).toBe("user_1");
    expect(body.orgRole).toBe("org:admin");
    expect(ensureUser).toHaveBeenCalledWith("user_1", expect.any(Function));
    expect(ensureMembership).toHaveBeenCalledWith(
      "org_42",
      "user_1",
      "org:admin",
    );
  });
});

describe("requireCapability middleware", () => {
  function gatedApp(auth: StubAuth) {
    const app = new Hono<ApiEnv>();
    app.use(stubClerk(auth));
    app.use(requireCapability(can.removeMember));
    app.get("/admin-only", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows an admin (role read from the session)", async () => {
    const app = gatedApp({
      userId: "user_1",
      orgRole: "org:admin",
      has: ({ role }) => role === "org:admin",
    });
    expect((await app.request("/admin-only")).status).toBe(200);
  });

  it("403s a non-admin", async () => {
    const app = gatedApp({
      userId: "user_1",
      orgRole: "org:member",
      has: ({ role }) => role === "org:member",
    });
    expect((await app.request("/admin-only")).status).toBe(403);
  });
});
