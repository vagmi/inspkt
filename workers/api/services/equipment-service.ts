import type { ClientsRepo } from "../repositories/clients-repo";
import type {
  Equipment,
  EquipmentCreate,
  EquipmentListRow,
  EquipmentRepo,
  EquipmentUpdate,
} from "../repositories/equipment-repo";
import type {
  EquipmentTypesRepo,
  EquipmentTypeWithForms,
} from "../repositories/equipment-types-repo";
import type { FacilitiesRepo } from "../repositories/facilities-repo";
import { NotFoundError, ValidationError } from "./errors";
import { validateMetadata } from "./metadata";

// Equipment: assets owned by a client, optionally at one of that client's
// facilities, of a type. The client and type are validated against the org; a
// facility (when given) must belong to the same client.

export interface EquipmentServiceDeps {
  equipmentRepo: EquipmentRepo;
  clientsRepo: ClientsRepo;
  facilitiesRepo: FacilitiesRepo;
  equipmentTypesRepo: EquipmentTypesRepo;
}

export function createEquipmentService({
  equipmentRepo,
  clientsRepo,
  facilitiesRepo,
  equipmentTypesRepo,
}: EquipmentServiceDeps) {
  async function assertClient(orgId: string, id: string): Promise<void> {
    if (!(await clientsRepo.getById(orgId, id)))
      throw new NotFoundError(`client ${id} not found`);
  }
  async function loadType(
    orgId: string,
    id: string,
  ): Promise<EquipmentTypeWithForms> {
    const type = await equipmentTypesRepo.getById(orgId, id);
    if (!type) throw new NotFoundError(`equipment type ${id} not found`);
    return type;
  }
  /** The facility must exist and belong to the owning client. */
  async function assertFacilityForClient(
    orgId: string,
    facilityId: string,
    clientId: string,
  ): Promise<void> {
    const facility = await facilitiesRepo.getById(orgId, facilityId);
    if (!facility) throw new NotFoundError(`facility ${facilityId} not found`);
    if (facility.clientId !== clientId) {
      throw new ValidationError(
        "the facility belongs to a different client than the equipment",
      );
    }
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

    listByClient(orgId: string, clientId: string): Promise<EquipmentListRow[]> {
      return equipmentRepo.listByClient(orgId, clientId);
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
      const type = await loadType(orgId, input.typeId);
      await assertClient(orgId, input.clientId);
      if (input.facilityId) {
        await assertFacilityForClient(orgId, input.facilityId, input.clientId);
      }
      // Custom field values must match the type's schema.
      validateMetadata(type.fields, input.metadata);
      return equipmentRepo.create({ ...input, orgId });
    },

    async update(
      orgId: string,
      id: string,
      patch: EquipmentUpdate,
    ): Promise<Equipment> {
      if (patch.clientId) await assertClient(orgId, patch.clientId);
      if (patch.typeId !== undefined) await loadType(orgId, patch.typeId);

      if (patch.facilityId) {
        // Validate the facility against the effective owner (new client if the
        // patch reassigns it, otherwise the equipment's current client).
        let clientId = patch.clientId;
        if (!clientId) {
          const current = await equipmentRepo.getById(orgId, id);
          if (!current) throw new NotFoundError(`equipment ${id} not found`);
          clientId = current.clientId ?? undefined;
        }
        if (clientId) {
          await assertFacilityForClient(orgId, patch.facilityId, clientId);
        }
      }

      // Validate metadata against the effective type (new typeId, else current).
      if (patch.metadata !== undefined) {
        let typeId = patch.typeId;
        if (!typeId) {
          const current = await equipmentRepo.getById(orgId, id);
          if (!current) throw new NotFoundError(`equipment ${id} not found`);
          typeId = current.typeId;
        }
        const type = await loadType(orgId, typeId);
        validateMetadata(type.fields, patch.metadata);
      }

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
