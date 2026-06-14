import { describe, expect, it } from "vitest";
import { createEquipmentTypesService } from "../../workers/api/services/equipment-types-service";
import {
  NotFoundError,
  ValidationError,
} from "../../workers/api/services/errors";
import {
  fakeEquipmentType,
  fakeForm,
  mockEquipmentRepo,
  mockEquipmentTypesRepo,
  mockFormsRepo,
} from "../helpers/mocks";

const ORG = "org_test_1";

function makeService() {
  const equipmentTypesRepo = mockEquipmentTypesRepo();
  const equipmentRepo = mockEquipmentRepo();
  const formsRepo = mockFormsRepo();
  const service = createEquipmentTypesService({
    equipmentTypesRepo,
    equipmentRepo,
    formsRepo,
  });
  return { service, equipmentTypesRepo, equipmentRepo, formsRepo };
}

describe("equipment types service", () => {
  it("create validates every attached form belongs to the org", async () => {
    const { service, equipmentTypesRepo, formsRepo } = makeService();
    formsRepo.getById.mockResolvedValue({ ...fakeForm(), checkpoints: [] });
    equipmentTypesRepo.create.mockResolvedValue({
      ...fakeEquipmentType(),
      forms: [],
    });

    await service.create(ORG, { name: "HVAC", formIds: ["form_1", "form_2"] });
    expect(formsRepo.getById).toHaveBeenCalledTimes(2);
    expect(equipmentTypesRepo.create).toHaveBeenCalledWith({
      orgId: ORG,
      name: "HVAC",
      formIds: ["form_1", "form_2"],
    });
  });

  it("create rejects when any form is unknown (NotFound)", async () => {
    const { service, equipmentTypesRepo, formsRepo } = makeService();
    formsRepo.getById
      .mockResolvedValueOnce({ ...fakeForm(), checkpoints: [] })
      .mockResolvedValueOnce(null);
    await expect(
      service.create(ORG, { name: "HVAC", formIds: ["form_1", "ghost"] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(equipmentTypesRepo.create).not.toHaveBeenCalled();
  });

  it("delete refuses a type that still has equipment", async () => {
    const { service, equipmentTypesRepo, equipmentRepo } = makeService();
    equipmentRepo.countByType.mockResolvedValue(2);
    await expect(service.delete(ORG, "type_1")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(equipmentTypesRepo.delete).not.toHaveBeenCalled();
  });

  it("delete proceeds when no equipment uses the type", async () => {
    const { service, equipmentTypesRepo, equipmentRepo } = makeService();
    equipmentRepo.countByType.mockResolvedValue(0);
    equipmentTypesRepo.delete.mockResolvedValue(true);
    await expect(service.delete(ORG, "type_1")).resolves.toBeUndefined();
  });

  it("get throws NotFound for a missing type", async () => {
    const { service, equipmentTypesRepo } = makeService();
    equipmentTypesRepo.getById.mockResolvedValue(null);
    await expect(service.get(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
