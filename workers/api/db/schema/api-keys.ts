import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { now } from "./helpers";
import { organizations } from "./organizations";
import { users } from "./users";

/** An organization's machine API key for headless access to the write API
 * (clients, facilities, equipment, types, forms). The plaintext token
 * (`inspkt_<hex>`) is shown to the creator exactly once at creation; we store
 * only its HMAC hash (peppered by an env secret), so a DB leak can't recover a
 * usable key. `prefix` is a non-secret fragment kept for display ("which key").
 * A key authenticates as a manager-equivalent actor scoped to its org. */
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    /** Human label, e.g. "CI import job". */
    name: text("name").notNull(),
    /** HMAC-SHA256(env pepper, token), hex. Unique so lookup is O(1). */
    tokenHash: text("token_hash").notNull(),
    /** Non-secret display fragment, e.g. "inspkt_a1b2c3d4". */
    prefix: text("prefix").notNull(),
    /** The human (Clerk user) who minted the key — used for attribution. */
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id),
    /** Last time the key was used to authenticate (throttled to ~1/min). */
    lastUsedAt: integer("last_used_at"),
    /** Optional hard expiry (unix seconds). */
    expiresAt: integer("expires_at"),
    /** Set when revoked; a revoked key never authenticates again. */
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    index("api_keys_org_id_idx").on(t.orgId),
    uniqueIndex("api_keys_token_hash_idx").on(t.tokenHash),
  ],
);
