import type {
  User,
  UserProfile,
  UsersRepo,
} from "../repositories/users-repo";

// Mirrors a Clerk user into D1 so the app has a stable row to FK against and to
// display. Clerk stays the source of truth — this never makes authz decisions.

/** Structural view of Clerk user.* webhook events (snake_case `data`). */
export interface ClerkUserEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: { id: string; email_address: string }[];
    primary_email_address_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
}

function primaryEmail(data: ClerkUserEvent["data"]): string {
  const list = data.email_addresses ?? [];
  const primary =
    list.find((e) => e.id === data.primary_email_address_id) ?? list[0];
  return primary?.email_address ?? "";
}

export function createUsersService(deps: { usersRepo: UsersRepo }) {
  return {
    /**
     * Return the local mirror row for a Clerk user, lazily creating it on first
     * sight. `fetchProfile` is only invoked when the row is missing (it costs a
     * Clerk API call), so the hot path is a single indexed read.
     */
    async ensureUser(
      userId: string,
      fetchProfile: () => Promise<UserProfile>,
    ): Promise<User> {
      const existing = await deps.usersRepo.getById(userId);
      if (existing) return existing;

      const profile = await fetchProfile();
      return deps.usersRepo.ensure(userId, profile);
    },

    getById(userId: string): Promise<User | null> {
      return deps.usersRepo.getById(userId);
    },

    /** Keep the local mirror in sync with Clerk user webhooks. */
    async syncFromClerk(event: ClerkUserEvent): Promise<void> {
      const { id } = event.data;
      switch (event.type) {
        case "user.created":
        case "user.updated":
          await deps.usersRepo.upsert(id, {
            email: primaryEmail(event.data),
            firstName: event.data.first_name ?? null,
            lastName: event.data.last_name ?? null,
            imageUrl: event.data.image_url ?? null,
          });
          break;
        case "user.deleted":
          await deps.usersRepo.delete(id);
          break;
        default:
          break;
      }
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
