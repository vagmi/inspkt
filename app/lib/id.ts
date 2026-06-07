import { ulid } from "ulid";

/** New ULID (sortable, URL-safe). Lowercased for friendlier URLs; Crockford
 * base32 decoding is case-insensitive. */
export function newId(): string {
  return ulid().toLowerCase();
}
