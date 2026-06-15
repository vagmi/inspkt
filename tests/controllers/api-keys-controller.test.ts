import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApiKeysController } from "../../workers/api/controllers/api-keys-controller";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { NotFoundError } from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import { fakeApiKey, mockApiKeysService } from "../helpers/mocks";

function makeApp({
  role = "admin",
  authMethod = "session",
  apiKeys = mockApiKeysService(),
}: {
  role?: string;
  authMethod?: string;
  apiKeys?: ReturnType<typeof mockApiKeysService>;
} = {}) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("userId", "user_test_1");
    c.set("role", role as never);
    c.set("authMethod", authMethod as never);
    c.set("services", { apiKeys } as never);
    await next();
  });
  app.route("/api-keys", createApiKeysController());
  return { app, apiKeys };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("api-keys controller", () => {
  it("GET lists keys without secrets", async () => {
    const { app, apiKeys } = makeApp();
    apiKeys.list.mockResolvedValue([fakeApiKey({ tokenHash: "secret-hash" })]);

    const res = await app.request("/api-keys");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { keys: Array<Record<string, unknown>> };
    expect(body.keys[0]).toMatchObject({ id: "key_1", prefix: "inspkt_a1b2c3d4" });
    // the hash never leaves the server
    expect(JSON.stringify(body)).not.toContain("secret-hash");
    expect(body.keys[0]).not.toHaveProperty("tokenHash");
  });

  it("POST creates a key and returns the plaintext token once", async () => {
    const { app, apiKeys } = makeApp();
    apiKeys.create.mockResolvedValue({
      apiKey: fakeApiKey(),
      token: `inspkt_${"a".repeat(64)}`,
    });

    const res = await app.request("/api-keys", json({ name: "CI" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { token: string };
    expect(body.token).toMatch(/^inspkt_[0-9a-f]{64}$/);
    expect(apiKeys.create).toHaveBeenCalledWith("org_test_1", "user_test_1", {
      name: "CI",
    });
  });

  it("POST rejects a nameless key", async () => {
    const { app, apiKeys } = makeApp();
    const res = await app.request("/api-keys", json({ name: "" }));
    expect(res.status).toBe(400);
    expect(apiKeys.create).not.toHaveBeenCalled();
  });

  it("403s a non-admin human", async () => {
    const { app, apiKeys } = makeApp({ role: "manager" });
    expect((await app.request("/api-keys")).status).toBe(403);
    expect(apiKeys.list).not.toHaveBeenCalled();
  });

  it("403s an API-key caller even if its role would allow it (human-only)", async () => {
    // A key authenticates as manager; requireHuman blocks it regardless.
    const { app, apiKeys } = makeApp({ role: "manager", authMethod: "apikey" });
    expect((await app.request("/api-keys")).status).toBe(403);
    expect(apiKeys.list).not.toHaveBeenCalled();
  });

  it("DELETE revokes a key", async () => {
    const { app, apiKeys } = makeApp();
    apiKeys.revoke.mockResolvedValue(undefined);
    const res = await app.request("/api-keys/key_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(apiKeys.revoke).toHaveBeenCalledWith("org_test_1", "key_1");
  });

  it("DELETE maps NotFound to 404", async () => {
    const { app, apiKeys } = makeApp();
    apiKeys.revoke.mockRejectedValue(new NotFoundError("nope"));
    const res = await app.request("/api-keys/nope", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
