import { seedRoleFromProvider, type AppRole } from "~/lib/capabilities";
import type {
  MemberView,
  Membership,
  MembershipsRepo,
} from "../repositories/memberships-repo";
import type { UsersRepo } from "../repositories/users-repo";
import { NotFoundError, ValidationError } from "./errors";

// Owns the org's membership rows. Membership EXISTENCE follows the identity
// provider (Clerk org membership): a row is created when a user is first seen,
// reconciled against the provider, and removed when they leave. But the ROLE on
// each row is app-owned — seeded once from the provider at creation, then
// changed only by an admin via setMemberRole. Provider webhooks/reconcile never
// overwrite an existing role. Authorization gates on this role
// (app/lib/capabilities.ts).

/** A member as returned by the provider's org-membership list (adapted by the
 * controller from the SDK shape). `role` here is the PROVIDER role, used only
 * to seed brand-new rows. */
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
     * Ensure the active member has a row, seeding their app role from the
     * provider role ON FIRST SIGHT ONLY. An existing row is returned untouched,
     * so an admin-assigned role is never reverted by a later request.
     */
    async ensureMembership(
      orgId: string,
      userId: string,
      providerRole: string | null,
    ): Promise<Membership> {
      const existing = await deps.membershipsRepo.get(orgId, userId);
      if (existing) return existing;

      await deps.membershipsRepo.ensureExists(
        orgId,
        userId,
        seedRoleFromProvider(providerRole),
      );
      const row = await deps.membershipsRepo.get(orgId, userId);
      if (!row) throw new Error(`failed to ensure membership ${orgId}/${userId}`);
      return row;
    },

    /**
     * Member list: refresh profiles, reconcile membership EXISTENCE against the
     * provider (new members seeded as inspectors, departed members pruned),
     * then return the joined rows with their app roles intact.
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
      // Seed any genuinely new member as the lowest-privilege role; existing
      // roles are left untouched by reconcile.
      await deps.membershipsRepo.reconcile(
        orgId,
        remote.map((m) => m.userId),
        "inspector",
      );
      return deps.membershipsRepo.listByOrg(orgId);
    },

    /**
     * Change a member's app role (admin action; gate with can.manageRoles at
     * the controller). Refuses to remove the org's last admin.
     */
    async setMemberRole(
      orgId: string,
      userId: string,
      role: AppRole,
    ): Promise<Membership> {
      const existing = await deps.membershipsRepo.get(orgId, userId);
      if (!existing) throw new NotFoundError(`member ${userId} not found`);

      if (existing.role === "admin" && role !== "admin") {
        const admins = await deps.membershipsRepo.countByRole(orgId, "admin");
        if (admins <= 1) {
          throw new ValidationError(
            "an organization must keep at least one admin",
          );
        }
      }
      await deps.membershipsRepo.setRole(orgId, userId, role);
      const row = await deps.membershipsRepo.get(orgId, userId);
      if (!row) throw new NotFoundError(`member ${userId} not found`);
      return row;
    },

    /** Remove a member from the provider (source of membership), then prune the
     * local row. Refuses to remove the last admin. */
    async removeMember(
      orgId: string,
      userId: string,
      removeRemote: () => Promise<void>,
    ): Promise<void> {
      const existing = await deps.membershipsRepo.get(orgId, userId);
      if (existing?.role === "admin") {
        const admins = await deps.membershipsRepo.countByRole(orgId, "admin");
        if (admins <= 1) {
          throw new ValidationError(
            "an organization must keep at least one admin",
          );
        }
      }
      await removeRemote();
      await deps.membershipsRepo.remove(orgId, userId);
    },

    /** Keep membership existence + profiles in sync with provider webhooks.
     * Seeds the app role only when the row is first created; an "updated" event
     * (e.g. the provider's own role changed) does NOT touch our role. */
    async syncFromClerk(event: ClerkMembershipEvent): Promise<void> {
      const orgId = event.data.organization?.id;
      const pud = event.data.public_user_data;
      const userId = pud?.user_id;
      if (!orgId || !userId) return;

      switch (event.type) {
        case "organizationMembership.created":
        case "organizationMembership.updated":
          await deps.usersRepo.upsert(userId, {
            email: pud?.identifier ?? "",
            firstName: pud?.first_name ?? null,
            lastName: pud?.last_name ?? null,
            imageUrl: pud?.image_url ?? null,
          });
          // Seed-once: creates the row with a seeded role if absent; leaves an
          // existing (app-owned) role untouched.
          await deps.membershipsRepo.ensureExists(
            orgId,
            userId,
            seedRoleFromProvider(event.data.role),
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
