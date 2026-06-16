import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createFormsController } from "../../workers/api/controllers/forms-controller";
import { NotFoundError } from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import {
  fakeCheckpoint,
  fakeForm,
  fakeOrg,
  mockFormsService,
} from "../helpers/mocks";

function makeApp(forms = mockFormsService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("org", fakeOrg());
    c.set("role", "admin"); // can.setup — writes are admin/manager gated
    c.set("services", { forms } as never);
    await next();
  });
  app.route("/forms", createFormsController());
  return { app, forms };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const validCheckpoints = [
  { prompt: "Tires inflated", answerType: "pass_fail" },
  {
    prompt: "Tread depth",
    answerType: "numeric",
    severity: "major",
    config: { unit: "mm", okMin: 3, okMax: 20, warnMin: 1.6 },
  },
  {
    prompt: "Cabin cleanliness",
    answerType: "rating",
    config: { scaleMax: 5, passMin: 4, warnMin: 3 },
  },
  { prompt: "General photos", answerType: "observation" },
];

describe("forms controller", () => {
  it("GET /forms lists org forms", async () => {
    const { app, forms } = makeApp();
    forms.list.mockResolvedValue([{ ...fakeForm(), checkpointCount: 2 }]);

    const res = await app.request("/forms");
    expect(res.status).toBe(200);
    expect(forms.list).toHaveBeenCalledWith("org_test_1");
  });

  it("POST /forms accepts every answer type and applies defaults", async () => {
    const { app, forms } = makeApp();
    forms.create.mockResolvedValue({ ...fakeForm(), checkpoints: [] });

    const res = await app.request(
      "/forms",
      json({ name: "Vehicle Pre-Trip", checkpoints: validCheckpoints }),
    );
    expect(res.status).toBe(201);
    const [, input] = forms.create.mock.calls[0];
    expect(input.checkpoints[0]).toMatchObject({
      severity: "minor",
      critical: false,
      photoRequired: false,
    });
  });

  it("POST /forms rejects a numeric checkpoint without config", async () => {
    const { app, forms } = makeApp();
    const res = await app.request(
      "/forms",
      json({
        name: "Bad",
        checkpoints: [{ prompt: "Pressure", answerType: "numeric" }],
      }),
    );
    expect(res.status).toBe(400);
    expect(forms.create).not.toHaveBeenCalled();
  });

  it("POST /forms rejects an incoherent numeric range", async () => {
    const { app, forms } = makeApp();
    const res = await app.request(
      "/forms",
      json({
        name: "Bad",
        checkpoints: [
          {
            prompt: "Pressure",
            answerType: "numeric",
            config: { okMin: 80, okMax: 60 },
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(forms.create).not.toHaveBeenCalled();
  });

  it("POST /forms rejects a rating pass threshold above the scale", async () => {
    const { app, forms } = makeApp();
    const res = await app.request(
      "/forms",
      json({
        name: "Bad",
        checkpoints: [
          {
            prompt: "Cleanliness",
            answerType: "rating",
            config: { scaleMax: 5, passMin: 6 },
          },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("POST /forms rejects a critical observation", async () => {
    const { app, forms } = makeApp();
    const res = await app.request(
      "/forms",
      json({
        name: "Bad",
        checkpoints: [
          { prompt: "Photos", answerType: "observation", critical: true },
        ],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH /forms/:id passes checkpoint reconciliation through", async () => {
    const { app, forms } = makeApp();
    forms.update.mockResolvedValue({
      ...fakeForm(),
      checkpoints: [fakeCheckpoint()],
    });

    const res = await app.request(
      "/forms/form_1",
      json(
        {
          name: "Renamed",
          checkpoints: [
            { id: "cp_1", prompt: "Kept", answerType: "pass_fail" },
          ],
        },
        "PATCH",
      ),
    );
    expect(res.status).toBe(200);
    const [orgId, id, patch] = forms.update.mock.calls[0];
    expect(orgId).toBe("org_test_1");
    expect(id).toBe("form_1");
    expect(patch.checkpoints[0]).toMatchObject({ id: "cp_1", prompt: "Kept" });
  });

  it("PATCH /forms/:id passes equipment type association through", async () => {
    const { app, forms } = makeApp();
    forms.update.mockResolvedValue({
      ...fakeForm(),
      checkpoints: [],
      types: [{ id: "type_1", name: "Rooftop HVAC" }],
    });

    const res = await app.request(
      "/forms/form_1",
      json({ typeIds: ["type_1", "type_2"] }, "PATCH"),
    );
    expect(res.status).toBe(200);
    const [, , patch] = forms.update.mock.calls[0];
    expect(patch.typeIds).toEqual(["type_1", "type_2"]);
  });

  it("PATCH /forms/:id/checkpoints/:cpId routes a granular edit through", async () => {
    const { app, forms } = makeApp();
    forms.updateCheckpoint.mockResolvedValue({
      ...fakeForm(),
      checkpoints: [fakeCheckpoint({ id: "cp_1" })],
      types: [],
    });

    const res = await app.request(
      "/forms/form_1/checkpoints/cp_1",
      json({ config: { okMin: 0, okMax: 50 } }, "PATCH"),
    );
    expect(res.status).toBe(200);
    const [orgId, formId, cpId, patch] = forms.updateCheckpoint.mock.calls[0];
    expect(orgId).toBe("org_test_1");
    expect(formId).toBe("form_1");
    expect(cpId).toBe("cp_1");
    expect(patch).toMatchObject({ config: { okMin: 0, okMax: 50 } });
  });

  it("PATCH /forms/:id/checkpoints/:cpId rejects an empty patch", async () => {
    const { app, forms } = makeApp();
    const res = await app.request(
      "/forms/form_1/checkpoints/cp_1",
      json({}, "PATCH"),
    );
    expect(res.status).toBe(400);
    expect(forms.updateCheckpoint).not.toHaveBeenCalled();
  });

  it("GET /forms/:id maps NotFoundError to 404", async () => {
    const { app, forms } = makeApp();
    forms.get.mockRejectedValue(new NotFoundError("nope"));

    const res = await app.request("/forms/missing");
    expect(res.status).toBe(404);
  });

  it("DELETE /forms/:id deletes", async () => {
    const { app, forms } = makeApp();
    forms.delete.mockResolvedValue(undefined);

    const res = await app.request("/forms/form_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(forms.delete).toHaveBeenCalledWith("org_test_1", "form_1");
  });
});
