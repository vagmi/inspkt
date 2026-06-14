import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createFacilitiesController } from "../../workers/api/controllers/facilities-controller";
import {
  NotFoundError,
  PlanLimitError,
} from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import { fakeFacility, fakeOrg, mockFacilitiesService } from "../helpers/mocks";

function makeApp(role: string, facilities = mockFacilitiesService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("org", fakeOrg());
    c.set("role", role as never);
    c.set("services", { facilities } as never);
    await next();
  });
  app.route("/facilities", createFacilitiesController());
  return { app, facilities };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const valid = { clientId: "client_1", name: "Building A" };

describe("facilities controller", () => {
  it("GET /facilities lists for any member", async () => {
    const { app, facilities } = makeApp("inspector");
    facilities.list.mockResolvedValue([
      { ...fakeFacility(), clientName: "Acme" },
    ]);
    const res = await app.request("/facilities");
    expect(res.status).toBe(200);
    expect(facilities.list).toHaveBeenCalledWith("org_test_1");
  });

  it("POST /facilities creates (manager) and returns 201", async () => {
    const { app, facilities } = makeApp("manager");
    facilities.create.mockResolvedValue(fakeFacility());
    const res = await app.request("/facilities", json(valid));
    expect(res.status).toBe(201);
    expect(facilities.create).toHaveBeenCalledWith("org_test_1", "free", valid);
  });

  it("POST /facilities 403s an inspector (can.setup)", async () => {
    const { app, facilities } = makeApp("inspector");
    const res = await app.request("/facilities", json(valid));
    expect(res.status).toBe(403);
    expect(facilities.create).not.toHaveBeenCalled();
  });

  it("POST /facilities 400s without a client", async () => {
    const { app, facilities } = makeApp("admin");
    const res = await app.request("/facilities", json({ name: "No client" }));
    expect(res.status).toBe(400);
    expect(facilities.create).not.toHaveBeenCalled();
  });

  it("POST /facilities maps PlanLimitError to 402", async () => {
    const { app, facilities } = makeApp("admin");
    facilities.create.mockRejectedValue(new PlanLimitError("cap reached"));
    const res = await app.request("/facilities", json(valid));
    expect(res.status).toBe(402);
  });

  it("POST /facilities maps a bad client to 404", async () => {
    const { app, facilities } = makeApp("admin");
    facilities.create.mockRejectedValue(new NotFoundError("client x not found"));
    const res = await app.request("/facilities", json(valid));
    expect(res.status).toBe(404);
  });

  it("PATCH /facilities/:id updates (admin)", async () => {
    const { app, facilities } = makeApp("admin");
    facilities.update.mockResolvedValue(fakeFacility({ name: "Renamed" }));
    const res = await app.request(
      "/facilities/facility_1",
      json({ name: "Renamed" }, "PATCH"),
    );
    expect(res.status).toBe(200);
    expect(facilities.update).toHaveBeenCalledWith("org_test_1", "facility_1", {
      name: "Renamed",
    });
  });

  it("DELETE /facilities/:id 403s an inspector, deletes for admin", async () => {
    const denied = makeApp("inspector");
    expect(
      (await denied.app.request("/facilities/facility_1", { method: "DELETE" }))
        .status,
    ).toBe(403);

    const { app, facilities } = makeApp("admin");
    facilities.delete.mockResolvedValue(undefined);
    const res = await app.request("/facilities/facility_1", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
  });
});
