import { describe, expect, it } from "vitest";
import { createFacilitiesService } from "../../workers/api/services/facilities-service";
import { NotFoundError } from "../../workers/api/services/errors";
import {
  fakeClient,
  fakeFacility,
  mockClientsRepo,
  mockFacilitiesRepo,
  mockUsageRepo,
} from "../helpers/mocks";

const ORG = "org_test_1";

function makeService() {
  const facilitiesRepo = mockFacilitiesRepo();
  const clientsRepo = mockClientsRepo();
  const usageRepo = mockUsageRepo();
  const service = createFacilitiesService({
    facilitiesRepo,
    clientsRepo,
    usageRepo,
  });
  return { service, facilitiesRepo, clientsRepo, usageRepo };
}

describe("facilities service", () => {
  describe("create", () => {
    it("creates and meters when the client exists", async () => {
      const { service, facilitiesRepo, clientsRepo, usageRepo } = makeService();
      clientsRepo.getById.mockResolvedValue(fakeClient());
      facilitiesRepo.create.mockResolvedValue(fakeFacility());

      await service.create(ORG, {
        clientId: "client_1",
        name: "Building A",
      });

      expect(facilitiesRepo.create).toHaveBeenCalledWith({
        orgId: ORG,
        clientId: "client_1",
        name: "Building A",
      });
      expect(usageRepo.increment).toHaveBeenCalledWith(ORG, expect.any(String));
    });

    it("rejects with NotFound when the client doesn't belong to the org", async () => {
      const { service, facilitiesRepo, clientsRepo } = makeService();
      clientsRepo.getById.mockResolvedValue(null);

      await expect(
        service.create(ORG, { clientId: "ghost", name: "X" }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(facilitiesRepo.create).not.toHaveBeenCalled();
    });
  });

  it("update validates a changed client and bubbles NotFound", async () => {
    const { service, facilitiesRepo, clientsRepo } = makeService();
    clientsRepo.getById.mockResolvedValue(null);

    await expect(
      service.update(ORG, "facility_1", { clientId: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(facilitiesRepo.update).not.toHaveBeenCalled();
  });

  it("get throws NotFoundError for missing facilities", async () => {
    const { service, facilitiesRepo } = makeService();
    facilitiesRepo.getById.mockResolvedValue(null);
    await expect(service.get(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("delete throws NotFoundError when nothing was deleted", async () => {
    const { service, facilitiesRepo } = makeService();
    facilitiesRepo.delete.mockResolvedValue(false);
    await expect(service.delete(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
