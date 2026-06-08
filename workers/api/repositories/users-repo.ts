import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import { now } from "../db/schema/helpers";

// The only layer that touches Drizzle/D1 for the users mirror. Users are global
// (a user can belong to many orgs) — the per-org link + role lives in
// memberships-repo. Copy the patterns here for your own global tables.

export type User = typeof users.$inferSelect;

export interface UserProfile {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
}

export function createUsersRepo(db: Db) {
  async function getById(id: string): Promise<User | null> {
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  }

  function values(id: string, p: UserProfile) {
    return {
      id,
      email: p.email,
      firstName: p.firstName ?? null,
      lastName: p.lastName ?? null,
      imageUrl: p.imageUrl ?? null,
    };
  }

  return {
    getById,

    /** Lazy-create the mirror row; no-op if it already exists (no write churn
     * on the hot path). Use `upsert` when you want to refresh the profile. */
    async ensure(id: string, profile: UserProfile): Promise<User> {
      await db.insert(users).values(values(id, profile)).onConflictDoNothing();
      const row = await getById(id);
      if (!row) throw new Error(`failed to ensure user ${id}`);
      return row;
    },

    /** Insert or refresh the profile (used by the member backfill / webhooks). */
    async upsert(id: string, profile: UserProfile): Promise<void> {
      await db
        .insert(users)
        .values(values(id, profile))
        .onConflictDoUpdate({
          target: users.id,
          set: { ...values(id, profile), updatedAt: now() },
        });
    },

    /** Sync profile from a Clerk user.updated webhook. */
    async updateFromClerk(id: string, profile: UserProfile): Promise<void> {
      await db
        .update(users)
        .set({ ...values(id, profile), updatedAt: now() })
        .where(eq(users.id, id));
    },

    async delete(id: string): Promise<void> {
      await db.delete(users).where(eq(users.id, id));
    },
  };
}

export type UsersRepo = ReturnType<typeof createUsersRepo>;
