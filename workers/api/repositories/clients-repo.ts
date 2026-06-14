import { and, desc, eq } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { clients } from "../db/schema";
import { now } from "../db/schema/helpers";

// The only layer that touches Drizzle/D1 for clients. Every query is scoped by
// `orgId` so one org can never read another's rows.

export type Client = typeof clients.$inferSelect;

export interface ClientCreate {
  orgId: string;
  name: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

export interface ClientUpdate {
  name?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

export function createClientsRepo(db: Db) {
  return {
    async create(input: ClientCreate): Promise<Client> {
      const [row] = await db
        .insert(clients)
        .values({
          id: newId(),
          orgId: input.orgId,
          name: input.name,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          notes: input.notes ?? null,
        })
        .returning();
      return row;
    },

    async getById(orgId: string, id: string): Promise<Client | null> {
      const [row] = await db
        .select()
        .from(clients)
        .where(and(eq(clients.orgId, orgId), eq(clients.id, id)))
        .limit(1);
      return row ?? null;
    },

    async listByOrg(orgId: string): Promise<Client[]> {
      return db
        .select()
        .from(clients)
        .where(eq(clients.orgId, orgId))
        .orderBy(desc(clients.createdAt));
    },

    async countByOrg(orgId: string): Promise<number> {
      const rows = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.orgId, orgId));
      return rows.length;
    },

    async update(
      orgId: string,
      id: string,
      patch: ClientUpdate,
    ): Promise<Client | null> {
      const set: Partial<typeof clients.$inferInsert> = { updatedAt: now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.contactName !== undefined) set.contactName = patch.contactName;
      if (patch.contactEmail !== undefined)
        set.contactEmail = patch.contactEmail;
      if (patch.contactPhone !== undefined)
        set.contactPhone = patch.contactPhone;
      if (patch.notes !== undefined) set.notes = patch.notes;

      const [row] = await db
        .update(clients)
        .set(set)
        .where(and(eq(clients.orgId, orgId), eq(clients.id, id)))
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(clients)
        .where(and(eq(clients.orgId, orgId), eq(clients.id, id)))
        .returning({ id: clients.id });
      return rows.length > 0;
    },
  };
}

export type ClientsRepo = ReturnType<typeof createClientsRepo>;
