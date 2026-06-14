import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../workers/api/services/errors";
import { createFormsService } from "../../workers/api/services/forms-service";
import { fakeCheckpoint, fakeForm, mockFormsRepo } from "../helpers/mocks";

const ORG = "org_test_1";

function makeService() {
  const formsRepo = mockFormsRepo();
  const service = createFormsService({ formsRepo });
  return { service, formsRepo };
}

describe("forms service", () => {
  it("create passes the payload through with the org id", async () => {
    const { service, formsRepo } = makeService();
    const created = { ...fakeForm(), checkpoints: [fakeCheckpoint()] };
    formsRepo.create.mockResolvedValue(created);

    const input = {
      name: "Vehicle Pre-Trip",
      checkpoints: [
        {
          prompt: "Tires inflated",
          answerType: "pass_fail" as const,
          severity: "major" as const,
          critical: false,
          photoRequired: false,
        },
      ],
    };
    await expect(service.create(ORG, input)).resolves.toBe(created);
    expect(formsRepo.create).toHaveBeenCalledWith({ ...input, orgId: ORG });
  });

  it("get throws NotFoundError for missing forms", async () => {
    const { service, formsRepo } = makeService();
    formsRepo.getById.mockResolvedValue(null);

    await expect(service.get(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("update throws NotFoundError when the repo misses", async () => {
    const { service, formsRepo } = makeService();
    formsRepo.update.mockResolvedValue(null);

    await expect(
      service.update(ORG, "nope", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("delete throws NotFoundError when nothing was deleted", async () => {
    const { service, formsRepo } = makeService();
    formsRepo.delete.mockResolvedValue(false);

    await expect(service.delete(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
