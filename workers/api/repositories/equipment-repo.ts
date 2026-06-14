import { and, desc, eq } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { equipment, equipmentTypes, facilities } from "../db/schema";
import { now } from "../db/schema/helpers";

// Org-scoped equipment: the inspectable assets, each at a facility and of a type.

export type Equipment = typeof equipment.$inferSelect;

/** An equipment row with its facility + type names joined, for list views. */
export interface EquipmentListRow extends Equipment {
  facilityName: string | null;
  typeName: string | null;
}

export interface EquipmentCreate {
  orgId: string;
  facilityId: string;
  typeId: string;
  name: string;
  identifier?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
}

export interface EquipmentUpdate {
  facilityId?: string;
  typeId?: string;
  name?: string;
  identifier?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
}

export function createEquipmentRepo(db: Db) {
  const withNames = {
    equipment,
    facilityName: facilities.name,
    typeName: equipmentTypes.name,
  };

  function joined(orgId: string) {
    return db
      .select(withNames)
      .from(equipment)
      .leftJoin(facilities, eq(equipment.facilityId, facilities.id))
      .leftJoin(equipmentTypes, eq(equipment.typeId, equipmentTypes.id))
      .where(eq(equipment.orgId, orgId));
  }

  return {
    async create(input: EquipmentCreate): Promise<Equipment> {
      const [row] = await db
        .insert(equipment)
        .values({
          id: newId(),
          orgId: input.orgId,
          facilityId: input.facilityId,
          typeId: input.typeId,
          name: input.name,
          identifier: input.identifier ?? null,
          locationLat: input.locationLat ?? null,
          locationLng: input.locationLng ?? null,
          locationLabel: input.locationLabel ?? null,
        })
        .returning();
      return row;
    },

    async getById(orgId: string, id: string): Promise<Equipment | null> {
      const [row] = await db
        .select()
        .from(equipment)
        .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)))
        .limit(1);
      return row ?? null;
    },

    async listByOrg(orgId: string): Promise<EquipmentListRow[]> {
      const rows = await joined(orgId).orderBy(desc(equipment.createdAt));
      return rows.map((r) => ({
        ...r.equipment,
        facilityName: r.facilityName,
        typeName: r.typeName,
      }));
    },

    async listByFacility(
      orgId: string,
      facilityId: string,
    ): Promise<EquipmentListRow[]> {
      const rows = await joined(orgId);
      return rows
        .filter((r) => r.equipment.facilityId === facilityId)
        .map((r) => ({
          ...r.equipment,
          facilityName: r.facilityName,
          typeName: r.typeName,
        }));
    },

    async countByOrg(orgId: string): Promise<number> {
      const rows = await db
        .select({ id: equipment.id })
        .from(equipment)
        .where(eq(equipment.orgId, orgId));
      return rows.length;
    },

    /** How many equipment use a given type — for the type-in-use delete guard. */
    async countByType(orgId: string, typeId: string): Promise<number> {
      const rows = await db
        .select({ id: equipment.id })
        .from(equipment)
        .where(and(eq(equipment.orgId, orgId), eq(equipment.typeId, typeId)));
      return rows.length;
    },

    async update(
      orgId: string,
      id: string,
      patch: EquipmentUpdate,
    ): Promise<Equipment | null> {
      const set: Partial<typeof equipment.$inferInsert> = { updatedAt: now() };
      if (patch.facilityId !== undefined) set.facilityId = patch.facilityId;
      if (patch.typeId !== undefined) set.typeId = patch.typeId;
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.identifier !== undefined) set.identifier = patch.identifier;
      if (patch.locationLat !== undefined) set.locationLat = patch.locationLat;
      if (patch.locationLng !== undefined) set.locationLng = patch.locationLng;
      if (patch.locationLabel !== undefined)
        set.locationLabel = patch.locationLabel;

      const [row] = await db
        .update(equipment)
        .set(set)
        .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)))
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(equipment)
        .where(and(eq(equipment.orgId, orgId), eq(equipment.id, id)))
        .returning({ id: equipment.id });
      return rows.length > 0;
    },
  };
}

export type EquipmentRepo = ReturnType<typeof createEquipmentRepo>;
