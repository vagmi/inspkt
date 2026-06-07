import { describe, expect, it } from "vitest";
import {
  NotFoundError,
  PlanLimitError,
} from "../../workers/api/services/errors";
import { createItemsService } from "../../workers/api/services/items-service";
import { fakeItem, mockItemsRepo, mockUsageRepo } from "../helpers/mocks";

const ORG = "org_test_1";

function makeService() {
  const itemsRepo = mockItemsRepo();
  const usageRepo = mockUsageRepo();
  const service = createItemsService({ itemsRepo, usageRepo });
  return { service, itemsRepo, usageRepo };
}

describe("items service", () => {
  describe("create", () => {
    it("creates and bumps the usage counter when under the plan limit", async () => {
      const { service, itemsRepo, usageRepo } = makeService();
      itemsRepo.countByOrg.mockResolvedValue(2);
      itemsRepo.create.mockResolvedValue(fakeItem());

      await service.create(ORG, "free", { name: "Widget" });

      expect(itemsRepo.create).toHaveBeenCalledWith({
        orgId: ORG,
        name: "Widget",
        description: null,
      });
      expect(usageRepo.increment).toHaveBeenCalledWith(ORG, expect.any(String));
    });

    it("rejects with PlanLimitError at the free-tier cap", async () => {
      const { service, itemsRepo, usageRepo } = makeService();
      itemsRepo.countByOrg.mockResolvedValue(3); // free cap

      await expect(
        service.create(ORG, "free", { name: "One too many" }),
      ).rejects.toBeInstanceOf(PlanLimitError);
      expect(itemsRepo.create).not.toHaveBeenCalled();
      expect(usageRepo.increment).not.toHaveBeenCalled();
    });

    it("allows more items on pro", async () => {
      const { service, itemsRepo } = makeService();
      itemsRepo.countByOrg.mockResolvedValue(10);
      itemsRepo.create.mockResolvedValue(fakeItem());

      await expect(
        service.create(ORG, "pro", { name: "Eleventh" }),
      ).resolves.toBeTruthy();
    });
  });

  it("get throws NotFoundError for missing items", async () => {
    const { service, itemsRepo } = makeService();
    itemsRepo.getById.mockResolvedValue(null);

    await expect(service.get(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("update throws NotFoundError when the repo misses", async () => {
    const { service, itemsRepo } = makeService();
    itemsRepo.update.mockResolvedValue(null);

    await expect(
      service.update(ORG, "nope", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete throws NotFoundError when nothing was deleted", async () => {
    const { service, itemsRepo } = makeService();
    itemsRepo.delete.mockResolvedValue(false);

    await expect(service.delete(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
