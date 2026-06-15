import { and, desc, eq, inArray } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { equipmentTypeForms, equipmentTypes, forms } from "../db/schema";
import type { FieldDef } from "../db/schema/equipment";
import { now } from "../db/schema/helpers";

// Org-scoped taxonomy of equipment types. A type has one or more inspection
// forms (its rubrics) via the equipment_type_forms join — many-to-many.

export type EquipmentType = typeof equipmentTypes.$inferSelect;

/** A form attached to a type. */
export interface AttachedForm {
  id: string;
  name: string;
}

export interface EquipmentTypeWithForms extends EquipmentType {
  forms: AttachedForm[];
}

export interface EquipmentTypeCreate {
  orgId: string;
  name: string;
  formIds: string[];
  fields?: FieldDef[];
  description?: string | null;
}

export interface EquipmentTypeUpdate {
  name?: string;
  formIds?: string[];
  fields?: FieldDef[];
  description?: string | null;
}

export function createEquipmentTypesRepo(db: Db) {
  async function formsFor(
    orgId: string,
    typeId: string,
  ): Promise<AttachedForm[]> {
    return db
      .select({ id: forms.id, name: forms.name })
      .from(equipmentTypeForms)
      .innerJoin(forms, eq(equipmentTypeForms.formId, forms.id))
      .where(
        and(
          eq(equipmentTypeForms.orgId, orgId),
          eq(equipmentTypeForms.typeId, typeId),
        ),
      );
  }

  /** Replace a type's attached forms with exactly `formIds`. */
  async function setForms(
    orgId: string,
    typeId: string,
    formIds: string[],
  ): Promise<void> {
    await db
      .delete(equipmentTypeForms)
      .where(
        and(
          eq(equipmentTypeForms.orgId, orgId),
          eq(equipmentTypeForms.typeId, typeId),
        ),
      );
    if (formIds.length > 0) {
      await db
        .insert(equipmentTypeForms)
        .values(formIds.map((formId) => ({ orgId, typeId, formId })));
    }
  }

  return {
    async create(
      input: EquipmentTypeCreate,
    ): Promise<EquipmentTypeWithForms> {
      const [row] = await db
        .insert(equipmentTypes)
        .values({
          id: newId(),
          orgId: input.orgId,
          name: input.name,
          description: input.description ?? null,
          fields: input.fields ?? [],
        })
        .returning();
      await setForms(input.orgId, row.id, input.formIds);
      return { ...row, forms: await formsFor(input.orgId, row.id) };
    },

    async getById(
      orgId: string,
      id: string,
    ): Promise<EquipmentTypeWithForms | null> {
      const [row] = await db
        .select()
        .from(equipmentTypes)
        .where(
          and(eq(equipmentTypes.orgId, orgId), eq(equipmentTypes.id, id)),
        )
        .limit(1);
      if (!row) return null;
      return { ...row, forms: await formsFor(orgId, id) };
    },

    async listByOrg(orgId: string): Promise<EquipmentTypeWithForms[]> {
      const types = await db
        .select()
        .from(equipmentTypes)
        .where(eq(equipmentTypes.orgId, orgId))
        .orderBy(desc(equipmentTypes.createdAt));
      if (types.length === 0) return [];

      const joins = await db
        .select({
          typeId: equipmentTypeForms.typeId,
          formId: forms.id,
          formName: forms.name,
        })
        .from(equipmentTypeForms)
        .innerJoin(forms, eq(equipmentTypeForms.formId, forms.id))
        .where(
          and(
            eq(equipmentTypeForms.orgId, orgId),
            inArray(
              equipmentTypeForms.typeId,
              types.map((t) => t.id),
            ),
          ),
        );

      const byType = new Map<string, AttachedForm[]>();
      for (const j of joins) {
        const list = byType.get(j.typeId) ?? [];
        list.push({ id: j.formId, name: j.formName });
        byType.set(j.typeId, list);
      }
      return types.map((t) => ({ ...t, forms: byType.get(t.id) ?? [] }));
    },

    async update(
      orgId: string,
      id: string,
      patch: EquipmentTypeUpdate,
    ): Promise<EquipmentTypeWithForms | null> {
      const set: Partial<typeof equipmentTypes.$inferInsert> = {
        updatedAt: now(),
      };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.description !== undefined) set.description = patch.description;
      if (patch.fields !== undefined) set.fields = patch.fields;

      const [row] = await db
        .update(equipmentTypes)
        .set(set)
        .where(and(eq(equipmentTypes.orgId, orgId), eq(equipmentTypes.id, id)))
        .returning();
      if (!row) return null;

      if (patch.formIds !== undefined) {
        await setForms(orgId, id, patch.formIds);
      }
      return { ...row, forms: await formsFor(orgId, id) };
    },

    async delete(orgId: string, id: string): Promise<boolean> {
      await db
        .delete(equipmentTypeForms)
        .where(
          and(
            eq(equipmentTypeForms.orgId, orgId),
            eq(equipmentTypeForms.typeId, id),
          ),
        );
      const rows = await db
        .delete(equipmentTypes)
        .where(and(eq(equipmentTypes.orgId, orgId), eq(equipmentTypes.id, id)))
        .returning({ id: equipmentTypes.id });
      return rows.length > 0;
    },
  };
}

export type EquipmentTypesRepo = ReturnType<typeof createEquipmentTypesRepo>;
