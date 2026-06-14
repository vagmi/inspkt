import { describe, expect, it } from "vitest";
import { createEquipmentService } from "../../workers/api/services/equipment-service";
import {
  NotFoundError,
  ValidationError,
} from "../../workers/api/services/errors";
import {
  fakeClient,
  fakeEquipment,
  fakeEquipmentType,
  fakeFacility,
  mockClientsRepo,
  mockEquipmentRepo,
  mockEquipmentTypesRepo,
  mockFacilitiesRepo,
} from "../helpers/mocks";

const ORG = "org_test_1";

function makeService() {
  const equipmentRepo = mockEquipmentRepo();
  const clientsRepo = mockClientsRepo();
  const facilitiesRepo = mockFacilitiesRepo();
  const equipmentTypesRepo = mockEquipmentTypesRepo();
  const service = createEquipmentService({
    equipmentRepo,
    clientsRepo,
    facilitiesRepo,
    equipmentTypesRepo,
  });
  return {
    service,
    equipmentRepo,
    clientsRepo,
    facilitiesRepo,
    equipmentTypesRepo,
  };
}

describe("equipment service", () => {
  it("create validates client + type + (same-client) facility, then creates", async () => {
    const { service, equipmentRepo, clientsRepo, facilitiesRepo, equipmentTypesRepo } =
      makeService();
    clientsRepo.getById.mockResolvedValue(fakeClient()); // client_1
    facilitiesRepo.getById.mockResolvedValue(fakeFacility()); // clientId client_1
    equipmentTypesRepo.getById.mockResolvedValue(fakeEquipmentType());
    equipmentRepo.create.mockResolvedValue(fakeEquipment());

    await service.create(ORG, {
      clientId: "client_1",
      facilityId: "facility_1",
      typeId: "type_1",
      name: "Unit A-1",
    });
    expect(equipmentRepo.create).toHaveBeenCalledWith({
      orgId: ORG,
      clientId: "client_1",
      facilityId: "facility_1",
      typeId: "type_1",
      name: "Unit A-1",
    });
  });

  it("create with no facility skips facility validation", async () => {
    const { service, equipmentRepo, clientsRepo, facilitiesRepo, equipmentTypesRepo } =
      makeService();
    clientsRepo.getById.mockResolvedValue(fakeClient());
    equipmentTypesRepo.getById.mockResolvedValue(fakeEquipmentType());
    equipmentRepo.create.mockResolvedValue(fakeEquipment({ facilityId: null }));

    await service.create(ORG, {
      clientId: "client_1",
      typeId: "type_1",
      name: "Van 7",
    });
    expect(facilitiesRepo.getById).not.toHaveBeenCalled();
    expect(equipmentRepo.create).toHaveBeenCalledWith({
      orgId: ORG,
      clientId: "client_1",
      typeId: "type_1",
      name: "Van 7",
    });
  });

  it("create rejects an unknown client with NotFound", async () => {
    const { service, equipmentRepo, clientsRepo, equipmentTypesRepo } =
      makeService();
    clientsRepo.getById.mockResolvedValue(null);
    equipmentTypesRepo.getById.mockResolvedValue(fakeEquipmentType());
    await expect(
      service.create(ORG, { clientId: "ghost", typeId: "type_1", name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(equipmentRepo.create).not.toHaveBeenCalled();
  });

  it("create rejects a facility owned by a different client", async () => {
    const { service, equipmentRepo, clientsRepo, facilitiesRepo, equipmentTypesRepo } =
      makeService();
    clientsRepo.getById.mockResolvedValue(fakeClient());
    equipmentTypesRepo.getById.mockResolvedValue(fakeEquipmentType());
    facilitiesRepo.getById.mockResolvedValue(
      fakeFacility({ clientId: "other_client" }),
    );
    await expect(
      service.create(ORG, {
        clientId: "client_1",
        facilityId: "facility_1",
        typeId: "type_1",
        name: "X",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(equipmentRepo.create).not.toHaveBeenCalled();
  });

  it("create rejects an unknown type with NotFound", async () => {
    const { service, equipmentRepo, clientsRepo, equipmentTypesRepo } =
      makeService();
    clientsRepo.getById.mockResolvedValue(fakeClient());
    equipmentTypesRepo.getById.mockResolvedValue(null);
    await expect(
      service.create(ORG, {
        clientId: "client_1",
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

  it("update checks a new facility against the equipment's current client", async () => {
    const { service, equipmentRepo, facilitiesRepo } = makeService();
    equipmentRepo.getById.mockResolvedValue(fakeEquipment()); // clientId client_1
    facilitiesRepo.getById.mockResolvedValue(
      fakeFacility({ clientId: "other_client" }),
    );
    await expect(
      service.update(ORG, "equip_1", { facilityId: "facility_9" }),
    ).rejects.toBeInstanceOf(ValidationError);
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
