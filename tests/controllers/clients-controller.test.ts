import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createClientsController } from "../../workers/api/controllers/clients-controller";
import { NotFoundError } from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import { fakeClient, fakeOrg, mockClientsService } from "../helpers/mocks";

function makeApp(role: string, clients = mockClientsService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("org", fakeOrg());
    c.set("role", role as never);
    c.set("services", { clients } as never);
    await next();
  });
  app.route("/clients", createClientsController());
  return { app, clients };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("clients controller", () => {
  it("GET /clients lists for any member", async () => {
    const { app, clients } = makeApp("inspector");
    clients.list.mockResolvedValue([fakeClient()]);
    const res = await app.request("/clients");
    expect(res.status).toBe(200);
    expect(clients.list).toHaveBeenCalledWith("org_test_1");
  });

  it("POST /clients creates (manager allowed) and returns 201", async () => {
    const { app, clients } = makeApp("manager");
    clients.create.mockResolvedValue(fakeClient({ name: "New" }));
    const res = await app.request("/clients", json({ name: "New" }));
    expect(res.status).toBe(201);
    expect(clients.create).toHaveBeenCalledWith("org_test_1", { name: "New" });
  });

  it("POST /clients 403s an inspector (can.setup)", async () => {
    const { app, clients } = makeApp("inspector");
    const res = await app.request("/clients", json({ name: "Nope" }));
    expect(res.status).toBe(403);
    expect(clients.create).not.toHaveBeenCalled();
  });

  it("POST /clients 400s an invalid email", async () => {
    const { app, clients } = makeApp("admin");
    const res = await app.request(
      "/clients",
      json({ name: "Acme", contactEmail: "not-an-email" }),
    );
    expect(res.status).toBe(400);
    expect(clients.create).not.toHaveBeenCalled();
  });

  it("PATCH /clients/:id updates (admin)", async () => {
    const { app, clients } = makeApp("admin");
    clients.update.mockResolvedValue(fakeClient({ name: "Renamed" }));
    const res = await app.request(
      "/clients/client_1",
      json({ name: "Renamed" }, "PATCH"),
    );
    expect(res.status).toBe(200);
    expect(clients.update).toHaveBeenCalledWith("org_test_1", "client_1", {
      name: "Renamed",
    });
  });

  it("GET /clients/:id maps NotFoundError to 404", async () => {
    const { app, clients } = makeApp("admin");
    clients.get.mockRejectedValue(new NotFoundError("nope"));
    const res = await app.request("/clients/missing");
    expect(res.status).toBe(404);
  });

  it("DELETE /clients/:id 403s an inspector, deletes for admin", async () => {
    const denied = makeApp("inspector");
    expect(
      (await denied.app.request("/clients/client_1", { method: "DELETE" }))
        .status,
    ).toBe(403);

    const { app, clients } = makeApp("admin");
    clients.delete.mockResolvedValue(undefined);
    const res = await app.request("/clients/client_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(clients.delete).toHaveBeenCalledWith("org_test_1", "client_1");
  });
});
