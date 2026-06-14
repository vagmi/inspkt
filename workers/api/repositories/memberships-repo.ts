import { and, asc, eq, notInArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { memberships, users } from "../db/schema";
import { now } from "../db/schema/helpers";

// The (org, user) link, scoped by `orgId`. The `role` column is the
// AUTHORITATIVE app role (admin/manager/inspector) — authorization gates on it
// (see app/lib/capabilities.ts). The identity provider seeds a row's role once
// at creation; thereafter only the app (admin action) changes it, so provider
// webhooks/reconcile must NOT overwrite it.

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

  /** Create the membership with a seed role if it doesn't exist yet. NEVER
   * touches the role of an existing row — the app owns it after creation. */
  async function ensureExists(
    orgId: string,
    userId: string,
    seedRole: string,
  ): Promise<void> {
    await db
      .insert(memberships)
      .values({ orgId, userId, role: seedRole })
      .onConflictDoNothing();
  }

  /** Set a member's role directly (admin action). Updates an existing row only. */
  async function setRole(
    orgId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    await db
      .update(memberships)
      .set({ role, updatedAt: now() })
      .where(
        and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
      );
  }

  return {
    get,
    ensureExists,
    setRole,

    /** How many members of the org hold a given role (for the last-admin guard). */
    async countByRole(orgId: string, role: string): Promise<number> {
      const rows = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(eq(memberships.orgId, orgId), eq(memberships.role, role)),
        );
      return rows.length;
    },

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

    /** Reconcile MEMBERSHIP EXISTENCE against the provider's member list: seed
     * any new member (with `seedRole`) and drop any local row no longer present
     * (so a missed "removed" webhook can't leave a ghost member). Crucially it
     * does NOT change the role of existing members — the app owns that.
     * Callers must have upserted the users first (FK). */
    async reconcile(
      orgId: string,
      userIds: string[],
      seedRole: string,
    ): Promise<void> {
      for (const userId of userIds) {
        await ensureExists(orgId, userId, seedRole);
      }
      await db
        .delete(memberships)
        .where(
          userIds.length
            ? and(
                eq(memberships.orgId, orgId),
                notInArray(memberships.userId, userIds),
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
