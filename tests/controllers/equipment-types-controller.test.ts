import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createEquipmentTypesController } from "../../workers/api/controllers/equipment-types-controller";
import { ValidationError } from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import { fakeEquipmentType, mockEquipmentTypesService } from "../helpers/mocks";

function makeApp(role: string, types = mockEquipmentTypesService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("role", role as never);
    c.set("services", { equipmentTypes: types } as never);
    await next();
  });
  app.route("/equipment-types", createEquipmentTypesController());
  return { app, types };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const valid = { name: "Rooftop HVAC", formIds: ["form_1", "form_2"] };

describe("equipment types controller", () => {
  it("GET lists for any member", async () => {
    const { app, types } = makeApp("inspector");
    types.list.mockResolvedValue([{ ...fakeEquipmentType(), forms: [] }]);
    const res = await app.request("/equipment-types");
    expect(res.status).toBe(200);
  });

  it("POST creates (manager) returns 201", async () => {
    const { app, types } = makeApp("manager");
    types.create.mockResolvedValue({ ...fakeEquipmentType(), forms: [] });
    const res = await app.request("/equipment-types", json(valid));
    expect(res.status).toBe(201);
    expect(types.create).toHaveBeenCalledWith("org_test_1", valid);
  });

  it("POST 403s an inspector", async () => {
    const { app, types } = makeApp("inspector");
    const res = await app.request("/equipment-types", json(valid));
    expect(res.status).toBe(403);
    expect(types.create).not.toHaveBeenCalled();
  });

  it("POST allows a type with no forms (defaults to none)", async () => {
    const { app, types } = makeApp("admin");
    types.create.mockResolvedValue({ ...fakeEquipmentType(), forms: [] });

    // formIds omitted entirely → defaults to []
    const res = await app.request("/equipment-types", json({ name: "Bare" }));
    expect(res.status).toBe(201);
    expect(types.create).toHaveBeenCalledWith("org_test_1", {
      name: "Bare",
      formIds: [],
    });
  });

  it("DELETE maps the in-use guard to 422", async () => {
    const { app, types } = makeApp("admin");
    types.delete.mockRejectedValue(new ValidationError("still has equipment"));
    const res = await app.request("/equipment-types/type_1", {
      method: "DELETE",
    });
    expect(res.status).toBe(422);
  });
});
