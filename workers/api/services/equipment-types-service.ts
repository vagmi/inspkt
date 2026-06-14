import type { EquipmentRepo } from "../repositories/equipment-repo";
import type {
  EquipmentTypeCreate,
  EquipmentTypeWithForms,
  EquipmentTypesRepo,
  EquipmentTypeUpdate,
} from "../repositories/equipment-types-repo";
import type { FormsRepo } from "../repositories/forms-repo";
import { NotFoundError, ValidationError } from "./errors";

// Equipment types: the taxonomy. Each type's forms (its rubrics, many-to-many)
// must belong to the org. A type that still has equipment cannot be deleted.

export interface EquipmentTypesServiceDeps {
  equipmentTypesRepo: EquipmentTypesRepo;
  equipmentRepo: EquipmentRepo;
  formsRepo: FormsRepo;
}

export function createEquipmentTypesService({
  equipmentTypesRepo,
  equipmentRepo,
  formsRepo,
}: EquipmentTypesServiceDeps) {
  /** Every form attached to a type must belong to the org. */
  async function assertForms(orgId: string, formIds: string[]): Promise<void> {
    for (const formId of formIds) {
      if (!(await formsRepo.getById(orgId, formId))) {
        throw new NotFoundError(`form ${formId} not found`);
      }
    }
  }

  return {
    list(orgId: string): Promise<EquipmentTypeWithForms[]> {
      return equipmentTypesRepo.listByOrg(orgId);
    },

    async get(orgId: string, id: string): Promise<EquipmentTypeWithForms> {
      const type = await equipmentTypesRepo.getById(orgId, id);
      if (!type) throw new NotFoundError(`equipment type ${id} not found`);
      return type;
    },

    async create(
      orgId: string,
      input: Omit<EquipmentTypeCreate, "orgId">,
    ): Promise<EquipmentTypeWithForms> {
      await assertForms(orgId, input.formIds);
      return equipmentTypesRepo.create({ ...input, orgId });
    },

    async update(
      orgId: string,
      id: string,
      patch: EquipmentTypeUpdate,
    ): Promise<EquipmentTypeWithForms> {
      if (patch.formIds !== undefined) await assertForms(orgId, patch.formIds);
      const updated = await equipmentTypesRepo.update(orgId, id, patch);
      if (!updated) throw new NotFoundError(`equipment type ${id} not found`);
      return updated;
    },

    async delete(orgId: string, id: string): Promise<void> {
      const inUse = await equipmentRepo.countByType(orgId, id);
      if (inUse > 0) {
        throw new ValidationError(
          `this type still has ${inUse} piece(s) of equipment — reassign or remove them first`,
        );
      }
      const deleted = await equipmentTypesRepo.delete(orgId, id);
      if (!deleted) throw new NotFoundError(`equipment type ${id} not found`);
    },
  };
}

export type EquipmentTypesService = ReturnType<
  typeof createEquipmentTypesService
>;
