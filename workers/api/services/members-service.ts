import type {
  MemberView,
  Membership,
  MembershipsRepo,
} from "../repositories/memberships-repo";
import type { UsersRepo } from "../repositories/users-repo";

// Owns the org's membership mirror: the active member is mirrored lazily each
// request; the full list is reconciled against Clerk on demand (for the Members
// page); webhooks keep it fresh in between. The `role` it stores is a mirror —
// authorization is decided from the session (app/lib/capabilities.ts).

/** A member as returned by the Clerk org-membership list (adapted by the
 * controller from the SDK shape). */
export interface ClerkMember {
  userId: string;
  role: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
}

/** Structural view of Clerk organizationMembership.* webhook events. */
export interface ClerkMembershipEvent {
  type: string;
  data: {
    role?: string;
    organization?: { id: string };
    public_user_data?: {
      user_id: string;
      identifier?: string | null;
      first_name?: string | null;
      last_name?: string | null;
      image_url?: string | null;
    };
  };
}

export function createMembersService(deps: {
  membershipsRepo: MembershipsRepo;
  usersRepo: UsersRepo;
}) {
  return {
    /**
     * Lazily mirror the active member's (org, user, role) on each request.
     * Skips the write when the row already matches, so the hot path stays a
     * single read. `role` comes from the live session, not the mirror.
     */
    async ensureMembership(
      orgId: string,
      userId: string,
      role: string,
    ): Promise<Membership> {
      const existing = await deps.membershipsRepo.get(orgId, userId);
      if (existing && existing.role === role) return existing;

      await deps.membershipsRepo.upsert(orgId, userId, role);
      const row = await deps.membershipsRepo.get(orgId, userId);
      if (!row) throw new Error(`failed to ensure membership ${orgId}/${userId}`);
      return row;
    },

    /**
     * Authoritative member list: reconcile the local mirror against Clerk
     * (`fetchAll`), then return the joined rows. Reconciling means a member
     * removed in Clerk disappears here even if the webhook was missed.
     */
    async listMembers(
      orgId: string,
      fetchAll: () => Promise<ClerkMember[]>,
    ): Promise<MemberView[]> {
      const remote = await fetchAll();
      for (const m of remote) {
        await deps.usersRepo.upsert(m.userId, {
          email: m.email,
          firstName: m.firstName ?? null,
          lastName: m.lastName ?? null,
          imageUrl: m.imageUrl ?? null,
        });
      }
      await deps.membershipsRepo.reconcile(
        orgId,
        remote.map((m) => ({ userId: m.userId, role: m.role })),
      );
      return deps.membershipsRepo.listByOrg(orgId);
    },

    /** Remove a member: delete it in Clerk (source of truth) via `removeRemote`,
     * then prune the local mirror. */
    async removeMember(
      orgId: string,
      userId: string,
      removeRemote: () => Promise<void>,
    ): Promise<void> {
      await removeRemote();
      await deps.membershipsRepo.remove(orgId, userId);
    },

    /** Keep the mirror in sync with Clerk organizationMembership webhooks. */
    async syncFromClerk(event: ClerkMembershipEvent): Promise<void> {
      const orgId = event.data.organization?.id;
      const pud = event.data.public_user_data;
      const userId = pud?.user_id;
      if (!orgId || !userId) return;

      switch (event.type) {
        case "organizationMembership.created":
        case "organizationMembership.updated":
          // ensure the user mirror exists first (FK), then the role.
          await deps.usersRepo.upsert(userId, {
            email: pud?.identifier ?? "",
            firstName: pud?.first_name ?? null,
            lastName: pud?.last_name ?? null,
            imageUrl: pud?.image_url ?? null,
          });
          await deps.membershipsRepo.upsert(
            orgId,
            userId,
            event.data.role ?? "org:member",
          );
          break;
        case "organizationMembership.deleted":
          await deps.membershipsRepo.remove(orgId, userId);
          break;
        default:
          break;
      }
    },
  };
}

export type MembersService = ReturnType<typeof createMembersService>;
