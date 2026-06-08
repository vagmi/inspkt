import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { organizations } from "../db/schema";
import { now } from "../db/schema/helpers";

export type Organization = typeof organizations.$inferSelect;

export function createOrganizationsRepo(db: Db) {
  async function getById(id: string): Promise<Organization | null> {
    const [row] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return row ?? null;
  }

  return {
    getById,

    /** Lazy-create the local mirror row for a Clerk org. */
    async ensure(
      id: string,
      name: string,
      slug?: string | null,
    ): Promise<Organization> {
      await db
        .insert(organizations)
        .values({ id, name, slug: slug ?? null })
        .onConflictDoNothing();
      const row = await getById(id);
      if (!row) throw new Error(`failed to ensure organization ${id}`);
      return row;
    },

    /** Sync name/slug from a Clerk organization.updated event. */
    async updateFromClerk(
      id: string,
      data: { name: string; slug?: string | null },
    ): Promise<void> {
      await db
        .update(organizations)
        .set({ name: data.name, slug: data.slug ?? null, updatedAt: now() })
        .where(eq(organizations.id, id));
    },

    async delete(id: string): Promise<void> {
      await db.delete(organizations).where(eq(organizations.id, id));
    },
  };
}

export type OrganizationsRepo = ReturnType<typeof createOrganizationsRepo>;
