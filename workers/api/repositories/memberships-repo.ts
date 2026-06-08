import { and, asc, eq, notInArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { memberships, users } from "../db/schema";
import { now } from "../db/schema/helpers";

// The local mirror of the Clerk User ↔ Organization link. Every query is scoped
// by `orgId`. The `role` column is a display/data mirror — NEVER gate on it
// (see app/lib/capabilities.ts); authorize from the Clerk session instead.

export type Membership = typeof memberships.$inferSelect;

/** A member with their profile joined in — what the Members page renders. */
export interface MemberView {
  userId: string;
  role: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  joinedAt: number;
}

export function createMembershipsRepo(db: Db) {
  async function get(
    orgId: string,
    userId: string,
  ): Promise<Membership | null> {
    const [row] = await db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
      )
      .limit(1);
    return row ?? null;
  }

  async function upsert(
    orgId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    await db
      .insert(memberships)
      .values({ orgId, userId, role })
      .onConflictDoUpdate({
        target: [memberships.orgId, memberships.userId],
        set: { role, updatedAt: now() },
      });
  }

  return {
    get,
    upsert,

    /** Members of an org, profile joined, oldest first. */
    async listByOrg(orgId: string): Promise<MemberView[]> {
      return db
        .select({
          userId: memberships.userId,
          role: memberships.role,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          imageUrl: users.imageUrl,
          joinedAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(eq(memberships.orgId, orgId))
        .orderBy(asc(memberships.createdAt));
    },

    /** Make the org's memberships exactly match `rows`: upsert each and drop
     * any local row no longer present (so a missed "removed" webhook can't
     * leave a ghost member). Callers must have upserted the users first (FK). */
    async reconcile(
      orgId: string,
      rows: { userId: string; role: string }[],
    ): Promise<void> {
      for (const r of rows) {
        await upsert(orgId, r.userId, r.role);
      }
      const keep = rows.map((r) => r.userId);
      await db
        .delete(memberships)
        .where(
          keep.length
            ? and(
                eq(memberships.orgId, orgId),
                notInArray(memberships.userId, keep),
              )
            : eq(memberships.orgId, orgId),
        );
    },

    async remove(orgId: string, userId: string): Promise<void> {
      await db
        .delete(memberships)
        .where(
          and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
        );
    },
  };
}

export type MembershipsRepo = ReturnType<typeof createMembershipsRepo>;
