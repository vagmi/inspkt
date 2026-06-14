import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createEquipmentController } from "../../workers/api/controllers/equipment-controller";
import { NotFoundError } from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import { fakeEquipment, mockEquipmentService } from "../helpers/mocks";

function makeApp(role: string, equipment = mockEquipmentService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("role", role as never);
    c.set("services", { equipment } as never);
    await next();
  });
  app.route("/equipment", createEquipmentController());
  return { app, equipment };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const valid = { facilityId: "facility_1", typeId: "type_1", name: "Unit A-1" };

describe("equipment controller", () => {
  it("GET lists all for any member", async () => {
    const { app, equipment } = makeApp("inspector");
    equipment.list.mockResolvedValue([
      { ...fakeEquipment(), facilityName: "F", typeName: "T" },
    ]);
    const res = await app.request("/equipment");
    expect(res.status).toBe(200);
    expect(equipment.list).toHaveBeenCalledWith("org_test_1");
  });

  it("GET ?facilityId= filters by facility", async () => {
    const { app, equipment } = makeApp("inspector");
    equipment.listByFacility.mockResolvedValue([]);
    const res = await app.request("/equipment?facilityId=facility_9");
    expect(res.status).toBe(200);
    expect(equipment.listByFacility).toHaveBeenCalledWith(
      "org_test_1",
      "facility_9",
    );
  });

  it("POST creates (admin) returns 201", async () => {
    const { app, equipment } = makeApp("admin");
    equipment.create.mockResolvedValue(fakeEquipment());
    const res = await app.request("/equipment", json(valid));
    expect(res.status).toBe(201);
    expect(equipment.create).toHaveBeenCalledWith("org_test_1", valid);
  });

  it("POST 403s an inspector", async () => {
    const { app, equipment } = makeApp("inspector");
    const res = await app.request("/equipment", json(valid));
    expect(res.status).toBe(403);
    expect(equipment.create).not.toHaveBeenCalled();
  });

  it("POST 400s without a type", async () => {
    const { app } = makeApp("admin");
    const res = await app.request(
      "/equipment",
      json({ facilityId: "facility_1", name: "No type" }),
    );
    expect(res.status).toBe(400);
  });

  it("POST maps a bad facility/type to 404", async () => {
    const { app, equipment } = makeApp("admin");
    equipment.create.mockRejectedValue(new NotFoundError("type x not found"));
    const res = await app.request("/equipment", json(valid));
    expect(res.status).toBe(404);
  });

  it("DELETE 403s an inspector, deletes for admin", async () => {
    expect(
      (
        await makeApp("inspector").app.request("/equipment/equip_1", {
          method: "DELETE",
        })
      ).status,
    ).toBe(403);

    const { app, equipment } = makeApp("admin");
    equipment.delete.mockResolvedValue(undefined);
    const res = await app.request("/equipment/equip_1", { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});
