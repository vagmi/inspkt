import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { describe, expect, it, vi } from "vitest";
import { can } from "../../app/lib/capabilities";
import {
  requireCapability,
  requireHuman,
  requireOrg,
  requireOrgOrApiKey,
} from "../../workers/api/middleware/auth";
import { mintWidgetToken } from "../../workers/api/lib/widget-token";
import type { ApiEnv } from "../../workers/api/types";
import { fakeMembership, fakeOrg, fakeUser } from "../helpers/mocks";

interface StubAuth {
  userId?: string | null;
  orgId?: string | null;
  orgRole?: string | null;
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

function makeApp(auth: StubAuth | null, membershipRole = "admin") {
  const ensureOrg = vi.fn().mockResolvedValue(fakeOrg());
  const ensureUser = vi.fn().mockResolvedValue(fakeUser());
  const ensureMembership = vi
    .fn()
    .mockResolvedValue(fakeMembership({ role: membershipRole }));

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
      role: c.var.role,
      membershipRole: c.var.membership.role,
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

  it("exposes the APP role from our membership and seeds with the provider role", async () => {
    const { app, ensureUser, ensureMembership } = makeApp(
      { userId: "user_1", orgId: "org_42", orgRole: "org:admin" },
      "manager", // our DB says manager — that's what authz uses
    );

    const res = await app.request("/probe");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orgId: string; role: string };
    expect(body.orgId).toBe("org_42");
    expect(body.role).toBe("manager"); // app role, not the provider's org:admin
    expect(ensureUser).toHaveBeenCalledWith("user_1", expect.any(Function));
    // ensureMembership is seeded with the PROVIDER role (org:admin), used only
    // if the row doesn't exist yet.
    expect(ensureMembership).toHaveBeenCalledWith(
      "org_42",
      "user_1",
      "org:admin",
    );
  });
});

describe("requireOrgOrApiKey middleware (API-key path)", () => {
  const TOKEN = `Bearer inspkt_${"a".repeat(64)}`;

  function keyApp(authResult: unknown) {
    const authenticate = vi.fn().mockResolvedValue(authResult);
    const app = new Hono<ApiEnv>();
    app.use(async (c, next) => {
      c.set("services", { apiKeys: { authenticate } } as never);
      await next();
    });
    app.use(requireOrgOrApiKey);
    app.get("/probe", (c) =>
      c.json({
        orgId: c.var.orgId,
        userId: c.var.userId,
        role: c.var.role,
        authMethod: c.var.authMethod,
      }),
    );
    return { app, authenticate };
  }

  it("authenticates a valid key as a manager scoped to its org", async () => {
    const { app, authenticate } = keyApp({
      org: fakeOrg({ id: "org_42" }),
      createdByUserId: "user_9",
      apiKeyId: "key_1",
    });

    const res = await app.request("/probe", {
      headers: { Authorization: TOKEN },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body).toMatchObject({
      orgId: "org_42",
      userId: "user_9", // attributed to the key's creator
      role: "manager",
      authMethod: "apikey",
    });
    expect(authenticate).toHaveBeenCalledWith(`inspkt_${"a".repeat(64)}`);
  });

  it("401s an invalid/unknown key", async () => {
    const { app } = keyApp(null);
    const res = await app.request("/probe", {
      headers: { Authorization: TOKEN },
    });
    expect(res.status).toBe(401);
  });
});

describe("requireOrgOrApiKey middleware (widget-token path)", () => {
  const SECRET = "widget-secret-1";

  function widgetApp(org: unknown) {
    const getById = vi.fn().mockResolvedValue(org);
    const app = new Hono<ApiEnv>();
    app.use(async (c, next) => {
      c.set("services", { organizations: { getById } } as never);
      await next();
    });
    app.use(requireOrgOrApiKey);
    app.get("/probe", (c) =>
      c.json({
        orgId: c.var.orgId,
        userId: c.var.userId,
        role: c.var.role,
        authMethod: c.var.authMethod,
      }),
    );
    return { app, getById };
  }

  const env = { WIDGET_TOKEN_SECRET: SECRET } as unknown as ApiEnv["Bindings"];

  it("authenticates a valid widget token as a manager scoped to its org", async () => {
    const { app, getById } = widgetApp(fakeOrg({ id: "org_42" }));
    const { token } = await mintWidgetToken(SECRET, {
      orgId: "org_42",
      role: "manager",
      userId: "user_9",
      ttlSeconds: 900,
    });

    const res = await app.request(
      "/probe",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      orgId: "org_42",
      userId: "user_9",
      role: "manager",
      authMethod: "widget",
    });
    expect(getById).toHaveBeenCalledWith("org_42");
  });

  it("401s a token signed with the wrong secret", async () => {
    const { app } = widgetApp(fakeOrg({ id: "org_42" }));
    const { token } = await mintWidgetToken("other-secret", {
      orgId: "org_42",
      role: "manager",
      userId: "user_9",
      ttlSeconds: 900,
    });
    const res = await app.request(
      "/probe",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("401s when the token's org is unknown", async () => {
    const { app } = widgetApp(null);
    const { token } = await mintWidgetToken(SECRET, {
      orgId: "org_gone",
      role: "manager",
      userId: "user_9",
      ttlSeconds: 900,
    });
    const res = await app.request(
      "/probe",
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe("requireHuman middleware", () => {
  function humanApp(authMethod: string) {
    const app = new Hono<ApiEnv>();
    app.use(async (c, next) => {
      c.set("authMethod", authMethod as never);
      await next();
    });
    app.use(requireHuman);
    app.get("/human-only", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows a Clerk session", async () => {
    expect((await humanApp("session").request("/human-only")).status).toBe(200);
  });

  it("403s an API-key request", async () => {
    expect((await humanApp("apikey").request("/human-only")).status).toBe(403);
  });

  it("403s a widget-token request", async () => {
    expect((await humanApp("widget").request("/human-only")).status).toBe(403);
  });
});

describe("requireCapability middleware", () => {
  /** Set the app role directly (as requireOrg would) and gate. */
  function gatedApp(role: string | null) {
    const app = new Hono<ApiEnv>();
    app.use(async (c, next) => {
      if (role) c.set("role", role as never);
      await next();
    });
    app.use(requireCapability(can.removeMember));
    app.get("/admin-only", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows an admin (role read from our DB)", async () => {
    expect((await gatedApp("admin").request("/admin-only")).status).toBe(200);
  });

  it("403s a non-admin", async () => {
    expect((await gatedApp("manager").request("/admin-only")).status).toBe(403);
    expect((await gatedApp(null).request("/admin-only")).status).toBe(403);
  });
});
