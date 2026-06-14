import { describe, expect, it } from "vitest";
import { createEquipmentService } from "../../workers/api/services/equipment-service";
import { NotFoundError } from "../../workers/api/services/errors";
import {
  fakeEquipment,
  fakeEquipmentType,
  fakeFacility,
  mockEquipmentRepo,
  mockEquipmentTypesRepo,
  mockFacilitiesRepo,
} from "../helpers/mocks";

const ORG = "org_test_1";

function makeService() {
  const equipmentRepo = mockEquipmentRepo();
  const facilitiesRepo = mockFacilitiesRepo();
  const equipmentTypesRepo = mockEquipmentTypesRepo();
  const service = createEquipmentService({
    equipmentRepo,
    facilitiesRepo,
    equipmentTypesRepo,
  });
  return { service, equipmentRepo, facilitiesRepo, equipmentTypesRepo };
}

describe("equipment service", () => {
  it("create validates the facility and type, then creates", async () => {
    const { service, equipmentRepo, facilitiesRepo, equipmentTypesRepo } =
      makeService();
    facilitiesRepo.getById.mockResolvedValue(fakeFacility());
    equipmentTypesRepo.getById.mockResolvedValue(fakeEquipmentType());
    equipmentRepo.create.mockResolvedValue(fakeEquipment());

    await service.create(ORG, {
      facilityId: "facility_1",
      typeId: "type_1",
      name: "Unit A-1",
    });
    expect(equipmentRepo.create).toHaveBeenCalledWith({
      orgId: ORG,
      facilityId: "facility_1",
      typeId: "type_1",
      name: "Unit A-1",
    });
  });

  it("create rejects an unknown facility with NotFound", async () => {
    const { service, equipmentRepo, facilitiesRepo, equipmentTypesRepo } =
      makeService();
    facilitiesRepo.getById.mockResolvedValue(null);
    equipmentTypesRepo.getById.mockResolvedValue(fakeEquipmentType());
    await expect(
      service.create(ORG, { facilityId: "ghost", typeId: "type_1", name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(equipmentRepo.create).not.toHaveBeenCalled();
  });

  it("create rejects an unknown type with NotFound", async () => {
    const { service, equipmentRepo, facilitiesRepo, equipmentTypesRepo } =
      makeService();
    facilitiesRepo.getById.mockResolvedValue(fakeFacility());
    equipmentTypesRepo.getById.mockResolvedValue(null);
    await expect(
      service.create(ORG, {
        facilityId: "facility_1",
        typeId: "ghost",
        name: "X",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(equipmentRepo.create).not.toHaveBeenCalled();
  });

  it("update validates a changed type", async () => {
    const { service, equipmentRepo, equipmentTypesRepo } = makeService();
    equipmentTypesRepo.getById.mockResolvedValue(null);
    await expect(
      service.update(ORG, "equip_1", { typeId: "ghost" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(equipmentRepo.update).not.toHaveBeenCalled();
  });

  it("delete throws NotFound when nothing was deleted", async () => {
    const { service, equipmentRepo } = makeService();
    equipmentRepo.delete.mockResolvedValue(false);
    await expect(service.delete(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
