import { and, desc, eq } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { items } from "../db/schema";
import { now } from "../db/schema/helpers";

// The repository is the ONLY layer that touches Drizzle/D1. Every query is
// scoped by `orgId` so one org can never read another's rows. Copy this file
// when you add your own resource.

export type Item = typeof items.$inferSelect;

export interface ItemCreate {
  orgId: string;
  name: string;
  description?: string | null;
}

export interface ItemUpdate {
  name?: string;
  description?: string | null;
}

export function createItemsRepo(db: Db) {
  return {
    async create(input: ItemCreate): Promise<Item> {
      const [row] = await db
        .insert(items)
        .values({
          id: newId(),
          orgId: input.orgId,
          name: input.name,
          description: input.description ?? null,
        })
        .returning();
      return row;
    },

    async getById(orgId: string, id: string): Promise<Item | null> {
      const [row] = await db
        .select()
        .from(items)
        .where(and(eq(items.orgId, orgId), eq(items.id, id)))
        .limit(1);
      return row ?? null;
    },

    async listByOrg(orgId: string): Promise<Item[]> {
      return db
        .select()
        .from(items)
        .where(eq(items.orgId, orgId))
        .orderBy(desc(items.createdAt));
    },

    async countByOrg(orgId: string): Promise<number> {
      const rows = await db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.orgId, orgId));
      return rows.length;
    },

    async update(
      orgId: string,
      id: string,
      patch: ItemUpdate,
    ): Promise<Item | null> {
      const set: Partial<typeof items.$inferInsert> = { updatedAt: now() };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.description !== undefined) set.description = patch.description;

      const [row] = await db
        .update(items)
        .set(set)
        .where(and(eq(items.orgId, orgId), eq(items.id, id)))
        .returning();
      return row ?? null;
    },

    async delete(orgId: string, id: string): Promise<boolean> {
      const rows = await db
        .delete(items)
        .where(and(eq(items.orgId, orgId), eq(items.id, id)))
        .returning({ id: items.id });
      return rows.length > 0;
    },
  };
}

export type ItemsRepo = ReturnType<typeof createItemsRepo>;
