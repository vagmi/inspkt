import { and, desc, eq } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { clients, facilities } from "../db/schema";
import { now } from "../db/schema/helpers";

// The only layer that touches Drizzle/D1 for facilities. Every query is scoped
// by `orgId`. A facility belongs to a client.

export type Facility = typeof facilities.$inferSelect;

/** A facility row with its client's name joined, for list views. */
export interface FacilityListRow extends Facility {
  clientName: string | null;
}

export interface FacilityCreate {
  orgId: string;
  clientId: string;
  name: string;
  description?: string | null;
  category?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
}

export interface FacilityUpdate {
  clientId?: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationLabel?: string | null;
}

export function createFacilitiesRepo(db: Db) {
  return {
    async create(input: FacilityCreate): Promise<Facility> {
      const [row] = await db
        .insert(facilities)
        .values({
          id: newId(),
          orgId: input.orgId,
          clientId: input.clientId,
          name: input.name,
          description: input.description ?? null,
          category: input.category ?? null,
          locationLat: input.locationLat ?? null,
          locationLng: input.locationLng ?? null,
          locationLabel: input.locationLabel ?? null,
        })
        .returning();
      return row;
    },

    async getById(orgId: string, id: string): Promise<Facility | null> {
      const [row] = await db
        .select()
        .from(facilities)
        .where(and(eq(facilities.orgId, orgId), eq(facilities.id, id)))
        .limit(1);
      return row ?? null;
    },

    async listByOrg(orgId: string): Promise<FacilityListRow[]> {
      const rows = await db
        .select({ facility: facilities, clientName: clients.name })
        .from(facilities)
        .leftJoin(clients, eq(facilities.clientId, clients.id))
        .where(eq(facilities.orgId, orgId))
        .orderBy(desc(facilities.createdAt));
      return rows.map((r) => ({ ...r.facility, clientName: r.clientName }));
    },

    async countByOrg(orgId: string): Promise<number> {
      const rows = await db
        .select({ id: facilities.id })
        .from(facilities)
        .where(eq(facilities.orgId, orgId));
      return rows.length;
    },

    async update(
      orgId: string,
      id: string,
      patch: FacilityUpdate,
    ): Promise<Facility | null> {
      const set: Partial<typeof facilities.$inferInsert> = { updatedAt: now() };
      if (patch.clientId !== undefined) set.clientId = patch.clientId;
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.description !== undefined) set.description = patch.description;
      if (patch.category !== undefined) set.category = patch.category;
      if (patch.locationLat !== undefined) set.locationLat = patch.locationLat;
      if (patch.locationLng !== undefined) set.locationLng = patch.locationLng;
      if (patch.locationLabel !== undefined)
        set.locationLabel = patch.locationLabel;

      const [row] = await db
        .update(facilities)
        .set(set)
        .where(and(eq(facilities.orgId, orgId), eq(facilities.id, id)))
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(facilities)
        .where(and(eq(facilities.orgId, orgId), eq(facilities.id, id)))
        .returning({ id: facilities.id });
      return rows.length > 0;
    },
  };
}

export type FacilitiesRepo = ReturnType<typeof createFacilitiesRepo>;
