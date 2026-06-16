import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { checkpoints, forms } from "../db/schema";
import type {
  CheckpointAnswerType,
  CheckpointConfig,
  CheckpointSeverity,
} from "../db/schema/forms";
import { now } from "../db/schema/helpers";

export type Form = typeof forms.$inferSelect;
export type Checkpoint = typeof checkpoints.$inferSelect;

export interface FormWithCheckpoints extends Form {
  checkpoints: Checkpoint[];
}

export interface CheckpointInput {
  /** When present and matching an existing checkpoint of this form, the row
   * is updated in place so its id stays stable across edits (inspections
   * will reference checkpoint ids). Unknown ids are treated as new rows. */
  id?: string;
  section?: string | null;
  prompt: string;
  answerType: CheckpointAnswerType;
  severity: CheckpointSeverity;
  critical: boolean;
  photoRequired: boolean;
  config?: CheckpointConfig | null;
}

export interface FormCreate {
  orgId: string;
  name: string;
  description?: string | null;
  checkpoints: CheckpointInput[];
}

export interface FormUpdate {
  name?: string;
  description?: string | null;
  /** When present, the full checkpoint set is reconciled against this list:
   * matched ids are updated, missing rows deleted, new rows inserted.
   * Positions follow array order. */
  checkpoints?: CheckpointInput[];
}

export function createFormsRepo(db: Db) {
  async function listCheckpoints(
    orgId: string,
    formId: string,
  ): Promise<Checkpoint[]> {
    return db
      .select()
      .from(checkpoints)
      .where(and(eq(checkpoints.orgId, orgId), eq(checkpoints.formId, formId)))
      .orderBy(asc(checkpoints.position));
  }

  async function reconcileCheckpoints(
    orgId: string,
    formId: string,
    inputs: CheckpointInput[],
  ): Promise<void> {
    const existing = await listCheckpoints(orgId, formId);
    const existingIds = new Set(existing.map((c) => c.id));
    const keptIds = new Set(
      inputs.map((c) => c.id).filter((id): id is string => !!id),
    );

    const toDelete = existing.filter((c) => !keptIds.has(c.id)).map((c) => c.id);
    if (toDelete.length > 0) {
      await db
        .delete(checkpoints)
        .where(
          and(
            eq(checkpoints.orgId, orgId),
            eq(checkpoints.formId, formId),
            inArray(checkpoints.id, toDelete),
          ),
        );
    }

    for (const [position, input] of inputs.entries()) {
      const fields = {
        position,
        section: input.section ?? null,
        prompt: input.prompt,
        answerType: input.answerType,
        severity: input.severity,
        critical: input.critical,
        photoRequired: input.photoRequired,
        config: input.config ?? null,
      };
      if (input.id && existingIds.has(input.id)) {
        await db
          .update(checkpoints)
          .set({ ...fields, updatedAt: now() })
          .where(
            and(
              eq(checkpoints.orgId, orgId),
              eq(checkpoints.formId, formId),
              eq(checkpoints.id, input.id),
            ),
          );
      } else {
        await db
          .insert(checkpoints)
          .values({ id: newId(), formId, orgId, ...fields });
      }
    }
  }

  return {
    async create(input: FormCreate): Promise<FormWithCheckpoints> {
      const [form] = await db
        .insert(forms)
        .values({
          id: newId(),
          orgId: input.orgId,
          name: input.name,
          description: input.description ?? null,
        })
        .returning();
      await reconcileCheckpoints(input.orgId, form.id, input.checkpoints);
      return { ...form, checkpoints: await listCheckpoints(input.orgId, form.id) };
    },

    async getById(orgId: string, id: string): Promise<FormWithCheckpoints | null> {
      const [form] = await db
        .select()
        .from(forms)
        .where(and(eq(forms.orgId, orgId), eq(forms.id, id)))
        .limit(1);
      if (!form) return null;
      return { ...form, checkpoints: await listCheckpoints(orgId, id) };
    },

    async listByOrg(
      orgId: string,
    ): Promise<Array<Form & { checkpointCount: number }>> {
      const rows = await db
        .select()
        .from(forms)
        .where(eq(forms.orgId, orgId))
        .orderBy(desc(forms.createdAt));
      const counts = await db
        .select({ formId: checkpoints.formId })
        .from(checkpoints)
        .where(eq(checkpoints.orgId, orgId));
      const byForm = new Map<string, number>();
      for (const { formId } of counts) {
        byForm.set(formId, (byForm.get(formId) ?? 0) + 1);
      }
      return rows.map((f) => ({ ...f, checkpointCount: byForm.get(f.id) ?? 0 }));
    },

    async countByOrg(orgId: string): Promise<number> {
      const rows = await db
        .select({ id: forms.id })
        .from(forms)
        .where(eq(forms.orgId, orgId));
      return rows.length;
    },

    async update(
      orgId: string,
      id: string,
      patch: FormUpdate,
    ): Promise<FormWithCheckpoints | null> {
      const set: Partial<typeof forms.$inferInsert> = { updatedAt: now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.description !== undefined) set.description = patch.description;

      const [form] = await db
        .update(forms)
        .set(set)
        .where(and(eq(forms.orgId, orgId), eq(forms.id, id)))
        .returning();
      if (!form) return null;

      if (patch.checkpoints !== undefined) {
        await reconcileCheckpoints(orgId, id, patch.checkpoints);
      }
      return { ...form, checkpoints: await listCheckpoints(orgId, id) };
    },

    /** Update one checkpoint's fields in place (single atomic statement). The
     * id is preserved so inspections that reference it stay valid. Scoped by
     * org + form so a checkpoint can't be edited across tenants. */
    async updateCheckpoint(
      orgId: string,
      formId: string,
      checkpointId: string,
      fields: Omit<CheckpointInput, "id">,
    ): Promise<Checkpoint | null> {
      const [row] = await db
        .update(checkpoints)
        .set({
          section: fields.section ?? null,
          prompt: fields.prompt,
          answerType: fields.answerType,
          severity: fields.severity,
          critical: fields.critical,
          photoRequired: fields.photoRequired,
          config: fields.config ?? null,
          updatedAt: now(),
        })
        .where(
          and(
            eq(checkpoints.orgId, orgId),
            eq(checkpoints.formId, formId),
            eq(checkpoints.id, checkpointId),
          ),
        )
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, id: string): Promise<boolean> {
      await db
        .delete(checkpoints)
        .where(and(eq(checkpoints.orgId, orgId), eq(checkpoints.formId, id)));
      const rows = await db
        .delete(forms)
        .where(and(eq(forms.orgId, orgId), eq(forms.id, id)))
        .returning({ id: forms.id });
      return rows.length > 0;
    },
  };
}

export type FormsRepo = ReturnType<typeof createFormsRepo>;
