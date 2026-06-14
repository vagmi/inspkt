import { describe, expect, it } from "vitest";
import { createClientsService } from "../../workers/api/services/clients-service";
import { NotFoundError } from "../../workers/api/services/errors";
import { fakeClient, mockClientsRepo } from "../helpers/mocks";

const ORG = "org_test_1";

function makeService() {
  const clientsRepo = mockClientsRepo();
  const service = createClientsService({ clientsRepo });
  return { service, clientsRepo };
}

describe("clients service", () => {
  it("create passes the payload through with the org id", async () => {
    const { service, clientsRepo } = makeService();
    clientsRepo.create.mockResolvedValue(fakeClient());

    await service.create(ORG, { name: "Acme", contactEmail: "a@acme.example" });
    expect(clientsRepo.create).toHaveBeenCalledWith({
      orgId: ORG,
      name: "Acme",
      contactEmail: "a@acme.example",
    });
  });

  it("get throws NotFoundError for a missing client", async () => {
    const { service, clientsRepo } = makeService();
    clientsRepo.getById.mockResolvedValue(null);
    await expect(service.get(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("update throws NotFoundError when the repo misses", async () => {
    const { service, clientsRepo } = makeService();
    clientsRepo.update.mockResolvedValue(null);
    await expect(
      service.update(ORG, "nope", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete throws NotFoundError when nothing was deleted", async () => {
    const { service, clientsRepo } = makeService();
    clientsRepo.delete.mockResolvedValue(false);
    await expect(service.delete(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
