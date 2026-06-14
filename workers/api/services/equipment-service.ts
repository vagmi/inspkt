import type { FacilitiesRepo } from "../repositories/facilities-repo";
import type {
  Equipment,
  EquipmentCreate,
  EquipmentListRow,
  EquipmentRepo,
  EquipmentUpdate,
} from "../repositories/equipment-repo";
import type { EquipmentTypesRepo } from "../repositories/equipment-types-repo";
import { NotFoundError } from "./errors";

// Equipment: assets at a facility, of a type. Both references are validated
// against the org on create and on a change.

export interface EquipmentServiceDeps {
  equipmentRepo: EquipmentRepo;
  facilitiesRepo: FacilitiesRepo;
  equipmentTypesRepo: EquipmentTypesRepo;
}

export function createEquipmentService({
  equipmentRepo,
  facilitiesRepo,
  equipmentTypesRepo,
}: EquipmentServiceDeps) {
  async function assertFacility(orgId: string, id: string): Promise<void> {
    if (!(await facilitiesRepo.getById(orgId, id)))
      throw new NotFoundError(`facility ${id} not found`);
  }
  async function assertType(orgId: string, id: string): Promise<void> {
    if (!(await equipmentTypesRepo.getById(orgId, id)))
      throw new NotFoundError(`equipment type ${id} not found`);
  }

  return {
    list(orgId: string): Promise<EquipmentListRow[]> {
      return equipmentRepo.listByOrg(orgId);
    },

    listByFacility(
      orgId: string,
      facilityId: string,
    ): Promise<EquipmentListRow[]> {
      return equipmentRepo.listByFacility(orgId, facilityId);
    },

    async get(orgId: string, id: string): Promise<Equipment> {
      const eq = await equipmentRepo.getById(orgId, id);
      if (!eq) throw new NotFoundError(`equipment ${id} not found`);
      return eq;
    },

    async create(
      orgId: string,
      input: Omit<EquipmentCreate, "orgId">,
    ): Promise<Equipment> {
      await Promise.all([
        assertFacility(orgId, input.facilityId),
        assertType(orgId, input.typeId),
      ]);
      return equipmentRepo.create({ ...input, orgId });
    },

    async update(
      orgId: string,
      id: string,
      patch: EquipmentUpdate,
    ): Promise<Equipment> {
      if (patch.facilityId !== undefined)
        await assertFacility(orgId, patch.facilityId);
      if (patch.typeId !== undefined) await assertType(orgId, patch.typeId);
      const updated = await equipmentRepo.update(orgId, id, patch);
      if (!updated) throw new NotFoundError(`equipment ${id} not found`);
      return updated;
    },

    async delete(orgId: string, id: string): Promise<void> {
      const deleted = await equipmentRepo.delete(orgId, id);
      if (!deleted) throw new NotFoundError(`equipment ${id} not found`);
    },
  };
}

export type EquipmentService = ReturnType<typeof createEquipmentService>;
