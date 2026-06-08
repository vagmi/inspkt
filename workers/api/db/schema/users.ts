import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { now } from "./helpers";

/** Local mirror of a Clerk user. `id` IS the Clerk user id — Clerk is the
 * identity source of truth, mirrored lazily on first authenticated request and
 * kept in sync by the optional `user.*` Clerk webhooks.
 *
 * This row exists so the app has something to foreign-key against (attribution,
 * per-user data, audit) and to list. It is NOT the authorization authority —
 * live role/permission checks read the Clerk session (see app/lib/capabilities.ts). */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  imageUrl: text("image_url"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
});
