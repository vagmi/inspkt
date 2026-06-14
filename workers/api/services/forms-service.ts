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

export interface FormsServiceDeps {
  formsRepo: FormsRepo;
}

export function createFormsService({ formsRepo }: FormsServiceDeps) {
  return {
    list(orgId: string): Promise<Array<Form & { checkpointCount: number }>> {
      return formsRepo.listByOrg(orgId);
    },

    async get(orgId: string, id: string): Promise<FormWithCheckpoints> {
      const form = await formsRepo.getById(orgId, id);
      if (!form) throw new NotFoundError(`form ${id} not found`);
      return form;
    },

    create(
      orgId: string,
      input: Omit<FormCreate, "orgId">,
    ): Promise<FormWithCheckpoints> {
      return formsRepo.create({ ...input, orgId });
    },

    async update(
      orgId: string,
      id: string,
      patch: FormUpdate,
    ): Promise<FormWithCheckpoints> {
      const updated = await formsRepo.update(orgId, id, patch);
      if (!updated) throw new NotFoundError(`form ${id} not found`);
      return updated;
    },

    async delete(orgId: string, id: string): Promise<void> {
      const deleted = await formsRepo.delete(orgId, id);
      if (!deleted) throw new NotFoundError(`form ${id} not found`);
    },
  };
}

export type FormsService = ReturnType<typeof createFormsService>;
