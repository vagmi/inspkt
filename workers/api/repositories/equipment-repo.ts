import { and, desc, eq } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { clients, equipment, equipmentTypes, facilities } from "../db/schema";
import type { Metadata } from "../db/schema/equipment";
import { now } from "../db/schema/helpers";

// Org-scoped equipment: the inspectable assets, each owned by a client,
// optionally at a facility, of a type.

export type Equipment = typeof equipment.$inferSelect;

/** An equipment row with its client / facility / type names joined. */
export interface EquipmentListRow extends Equipment {
  clientName: string | null;
  facilityName: string | null;
  typeName: string | null;
}

export interface EquipmentCreate {
  orgId: string;
  clientId: string;
  /** Optional — mobile equipment has no facility (but still has a client). */
  facilityId?: string | null;
  typeId: string;
  name: string;
  identifier?: string | null;
  /** Validated against the type's schema by the service before it reaches here. */
  metadata?: Record<string, unknown>;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
}

export interface EquipmentUpdate {
  clientId?: string;
  facilityId?: string | null;
  typeId?: string;
  name?: string;
  identifier?: string | null;
  metadata?: Record<string, unknown>;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
}

export function createEquipmentRepo(db: Db) {
  const withNames = {
    equipment,
    clientName: clients.name,
    facilityName: facilities.name,
    typeName: equipmentTypes.name,
  };

  function selectJoined() {
    return db
      .select(withNames)
      .from(equipment)
      .leftJoin(clients, eq(equipment.clientId, clients.id))
      .leftJoin(facilities, eq(equipment.facilityId, facilities.id))
      .leftJoin(equipmentTypes, eq(equipment.typeId, equipmentTypes.id));
  }

  const toRow = (r: {
    equipment: Equipment;
    clientName: string | null;
    facilityName: string | null;
    typeName: string | null;
  }): EquipmentListRow => ({
    ...r.equipment,
    clientName: r.clientName,
    facilityName: r.facilityName,
    typeName: r.typeName,
  });

  return {
    async create(input: EquipmentCreate): Promise<Equipment> {
      const [row] = await db
        .insert(equipment)
        .values({
          id: newId(),
          orgId: input.orgId,
          clientId: input.clientId,
          facilityId: input.facilityId ?? null,
          typeId: input.typeId,
          name: input.name,
          identifier: input.identifier ?? null,
          metadata: (input.metadata ?? {}) as Metadata,
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
      const rows = await selectJoined()
        .where(eq(equipment.orgId, orgId))
        .orderBy(desc(equipment.createdAt));
      return rows.map(toRow);
    },

    async listByFacility(
      orgId: string,
      facilityId: string,
    ): Promise<EquipmentListRow[]> {
      const rows = await selectJoined()
        .where(
          and(
            eq(equipment.orgId, orgId),
            eq(equipment.facilityId, facilityId),
          ),
        )
        .orderBy(desc(equipment.createdAt));
      return rows.map(toRow);
    },

    /** All of a client's equipment — facility-bound and mobile alike. */
    async listByClient(
      orgId: string,
      clientId: string,
    ): Promise<EquipmentListRow[]> {
      const rows = await selectJoined()
        .where(
          and(eq(equipment.orgId, orgId), eq(equipment.clientId, clientId)),
        )
        .orderBy(desc(equipment.createdAt));
      return rows.map(toRow);
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
      if (patch.clientId !== undefined) set.clientId = patch.clientId;
      if (patch.facilityId !== undefined) set.facilityId = patch.facilityId;
      if (patch.typeId !== undefined) set.typeId = patch.typeId;
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.identifier !== undefined) set.identifier = patch.identifier;
      if (patch.metadata !== undefined)
        set.metadata = patch.metadata as Metadata;
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
