import type {
  AttachedType,
  EquipmentTypesRepo,
} from "../repositories/equipment-types-repo";
import type {
  Form,
  FormCreate,
  FormsRepo,
  FormUpdate,
  FormWithCheckpoints,
} from "../repositories/forms-repo";
import { NotFoundError } from "./errors";

// Forms are the org's inspection rubrics. Checkpoint config coherence
// (numeric ranges, rating thresholds) is enforced by zod at the controller
// edge; this layer owns existence semantics. A plan gate on form count
// arrives with the billing phase.
//
// A form applies to zero or more equipment types (the type↔form join is
// many-to-many; it can be edited from either side — `equipment-types-service`
// owns the type side, this owns the form side).

export interface FormsServiceDeps {
  formsRepo: FormsRepo;
  equipmentTypesRepo: EquipmentTypesRepo;
}

/** A form plus the equipment types it applies to. */
export interface FormWithTypes extends FormWithCheckpoints {
  types: AttachedType[];
}

/** A list row: a form, its checkpoint count, and the types it applies to. */
export interface FormListRow extends Form {
  checkpointCount: number;
  types: AttachedType[];
}

export function createFormsService({
  formsRepo,
  equipmentTypesRepo,
}: FormsServiceDeps) {
  /** Every type id in `typeIds` must belong to the org. */
  async function assertTypes(orgId: string, typeIds: string[]): Promise<void> {
    for (const typeId of typeIds) {
      if (!(await equipmentTypesRepo.getById(orgId, typeId))) {
        throw new NotFoundError(`equipment type ${typeId} not found`);
      }
    }
  }

  return {
    async list(orgId: string): Promise<FormListRow[]> {
      const [forms, links] = await Promise.all([
        formsRepo.listByOrg(orgId),
        equipmentTypesRepo.typeLinksByForm(orgId),
      ]);
      const byForm = new Map<string, AttachedType[]>();
      for (const { formId, type } of links) {
        const list = byForm.get(formId) ?? [];
        list.push(type);
        byForm.set(formId, list);
      }
      return forms.map((f) => ({ ...f, types: byForm.get(f.id) ?? [] }));
    },

    async get(orgId: string, id: string): Promise<FormWithTypes> {
      const form = await formsRepo.getById(orgId, id);
      if (!form) throw new NotFoundError(`form ${id} not found`);
      const types = await equipmentTypesRepo.typesForForm(orgId, id);
      return { ...form, types };
    },

    async create(
      orgId: string,
      input: Omit<FormCreate, "orgId"> & { typeIds?: string[] },
    ): Promise<FormWithTypes> {
      const { typeIds, ...formInput } = input;
      const created = await formsRepo.create({ ...formInput, orgId });
      if (typeIds !== undefined) {
        await assertTypes(orgId, typeIds);
        await equipmentTypesRepo.setTypesForForm(orgId, created.id, typeIds);
      }
      return {
        ...created,
        types: await equipmentTypesRepo.typesForForm(orgId, created.id),
      };
    },

    async update(
      orgId: string,
      id: string,
      patch: FormUpdate & { typeIds?: string[] },
    ): Promise<FormWithTypes> {
      const { typeIds, ...formPatch } = patch;
      if (typeIds !== undefined) await assertTypes(orgId, typeIds);

      const updated = await formsRepo.update(orgId, id, formPatch);
      if (!updated) throw new NotFoundError(`form ${id} not found`);

      if (typeIds !== undefined) {
        await equipmentTypesRepo.setTypesForForm(orgId, id, typeIds);
      }
      return {
        ...updated,
        types: await equipmentTypesRepo.typesForForm(orgId, id),
      };
    },

    async delete(orgId: string, id: string): Promise<void> {
      // The join rows are owned by the type side; clearing them keeps the
      // join clean when a form is removed.
      await equipmentTypesRepo.setTypesForForm(orgId, id, []);
      const deleted = await formsRepo.delete(orgId, id);
      if (!deleted) throw new NotFoundError(`form ${id} not found`);
    },
  };
}

export type FormsService = ReturnType<typeof createFormsService>;
