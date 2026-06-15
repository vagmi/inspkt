import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createInspectionsController } from "../../workers/api/controllers/inspections-controller";
import {
  NotFoundError,
  ValidationError,
} from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import {
  fakeInspection,
  fakeOrg,
  mockInspectionsService,
} from "../helpers/mocks";

function makeApp(inspections = mockInspectionsService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("userId", "user_test_1");
    c.set("org", fakeOrg());
    c.set("services", { inspections } as never);
    await next();
  });
  app.route("/inspections", createInspectionsController());
  return { app, inspections };
}

function json(body: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("inspections controller", () => {
  it("GET /inspections lists org inspections", async () => {
    const { app, inspections } = makeApp();
    inspections.list.mockResolvedValue([fakeInspection()]);

    const res = await app.request("/inspections");
    expect(res.status).toBe(200);
    expect(inspections.list).toHaveBeenCalledWith("org_test_1");
  });

  it("POST /inspections attributes the inspector from the session", async () => {
    const { app, inspections } = makeApp();
    inspections.create.mockResolvedValue({ ...fakeInspection() });

    const res = await app.request(
      "/inspections",
      json({ equipmentId: "equip_1", formId: "form_1" }),
    );
    expect(res.status).toBe(201);
    expect(inspections.create).toHaveBeenCalledWith(
      "org_test_1",
      "user_test_1",
      { equipmentId: "equip_1", formId: "form_1" },
    );
  });

  it("POST /inspections rejects a lone latitude", async () => {
    const { app, inspections } = makeApp();
    const res = await app.request(
      "/inspections",
      json({ equipmentId: "e", formId: "fm", capturedLat: 12.97 }),
    );
    expect(res.status).toBe(400);
    expect(inspections.create).not.toHaveBeenCalled();
  });

  it("POST /inspections maps NotFoundError (bad equipment/form) to 404", async () => {
    const { app, inspections } = makeApp();
    inspections.create.mockRejectedValue(
      new NotFoundError("equipment x not found"),
    );

    const res = await app.request(
      "/inspections",
      json({ equipmentId: "x", formId: "f" }),
    );
    expect(res.status).toBe(404);
  });

  it("PATCH /inspections/:id saves draft observations", async () => {
    const { app, inspections } = makeApp();
    inspections.saveDraft.mockResolvedValue({ ...fakeInspection() });

    const res = await app.request(
      "/inspections/insp_1",
      json(
        {
          observations: [
            {
              checkpointId: "cp_1",
              answer: { type: "pass_fail", pass: true },
              note: "ok",
            },
          ],
        },
        "PATCH",
      ),
    );
    expect(res.status).toBe(200);
    const [orgId, id, observations] = inspections.saveDraft.mock.calls[0];
    expect(orgId).toBe("org_test_1");
    expect(id).toBe("insp_1");
    expect(observations[0]).toMatchObject({ checkpointId: "cp_1" });
  });

  it("PATCH /inspections/:id rejects a malformed answer", async () => {
    const { app, inspections } = makeApp();
    const res = await app.request(
      "/inspections/insp_1",
      json(
        {
          observations: [
            { checkpointId: "cp_1", answer: { type: "pass_fail" } }, // missing pass
          ],
        },
        "PATCH",
      ),
    );
    expect(res.status).toBe(400);
    expect(inspections.saveDraft).not.toHaveBeenCalled();
  });

  it("POST /inspections/:id/submit maps the completeness gate to 422", async () => {
    const { app, inspections } = makeApp();
    inspections.submit.mockRejectedValue(
      new ValidationError("cannot submit yet: \"X\" needs an answer"),
    );

    const res = await app.request(
      "/inspections/insp_1/submit",
      json({ observations: [] }),
    );
    expect(res.status).toBe(422);
    expect(inspections.submit).toHaveBeenCalled();
  });

  it("POST /inspections/:id/submit returns the finalized inspection", async () => {
    const { app, inspections } = makeApp();
    inspections.submit.mockResolvedValue(
      fakeInspection({ status: "submitted" }),
    );

    const res = await app.request(
      "/inspections/insp_1/submit",
      json({ observations: [] }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { inspection: { status: string } };
    expect(body.inspection.status).toBe("submitted");
  });

  it("DELETE /inspections/:id deletes", async () => {
    const { app, inspections } = makeApp();
    inspections.delete.mockResolvedValue(undefined);

    const res = await app.request("/inspections/insp_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(inspections.delete).toHaveBeenCalledWith("org_test_1", "insp_1");
  });
});
