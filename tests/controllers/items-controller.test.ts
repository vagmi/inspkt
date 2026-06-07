import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { domainErrorHandler } from "../../workers/api/controllers/error-handler";
import { createItemsController } from "../../workers/api/controllers/items-controller";
import {
  NotFoundError,
  PlanLimitError,
} from "../../workers/api/services/errors";
import type { ApiEnv } from "../../workers/api/types";
import { fakeItem, fakeOrg, mockItemsService } from "../helpers/mocks";

/** Mount the controller the way createApi does, with stubbed auth/services. */
function makeApp(items = mockItemsService()) {
  const app = new Hono<ApiEnv>();
  app.onError(domainErrorHandler);
  app.use(async (c, next) => {
    c.set("orgId", "org_test_1");
    c.set("org", fakeOrg());
    c.set("services", { items } as never);
    await next();
  });
  app.route("/items", createItemsController());
  return { app, items };
}

function json(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

describe("items controller", () => {
  it("GET /items lists org items", async () => {
    const { app, items } = makeApp();
    items.list.mockResolvedValue([fakeItem()]);

    const res = await app.request("/items");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
    expect(items.list).toHaveBeenCalledWith("org_test_1");
  });

  it("POST /items creates and returns 201", async () => {
    const { app, items } = makeApp();
    items.create.mockResolvedValue(fakeItem({ name: "New" }));

    const res = await app.request("/items", json({ name: "New" }));
    expect(res.status).toBe(201);
    expect(items.create).toHaveBeenCalledWith("org_test_1", "free", {
      name: "New",
    });
  });

  it("POST /items returns 400 on invalid body", async () => {
    const { app, items } = makeApp();
    const res = await app.request("/items", json({ name: "" }));
    expect(res.status).toBe(400);
    expect(items.create).not.toHaveBeenCalled();
  });

  it("POST /items maps PlanLimitError to 402", async () => {
    const { app, items } = makeApp();
    items.create.mockRejectedValue(new PlanLimitError("cap reached"));

    const res = await app.request("/items", json({ name: "Over" }));
    expect(res.status).toBe(402);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("plan_limit");
  });

  it("GET /items/:id maps NotFoundError to 404", async () => {
    const { app, items } = makeApp();
    items.get.mockRejectedValue(new NotFoundError("nope"));

    const res = await app.request("/items/missing");
    expect(res.status).toBe(404);
  });

  it("PATCH /items/:id passes valid updates through", async () => {
    const { app, items } = makeApp();
    items.update.mockResolvedValue(fakeItem({ name: "Renamed" }));

    const res = await app.request("/items/item_1", {
      ...json({ name: "Renamed" }),
      method: "PATCH",
    });
    expect(res.status).toBe(200);
    expect(items.update).toHaveBeenCalledWith("org_test_1", "item_1", {
      name: "Renamed",
    });
  });

  it("DELETE /items/:id deletes", async () => {
    const { app, items } = makeApp();
    items.delete.mockResolvedValue(undefined);

    const res = await app.request("/items/item_1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(items.delete).toHaveBeenCalledWith("org_test_1", "item_1");
  });
});
