import { and, desc, eq } from "drizzle-orm";
import { newId } from "~/lib/id";
import type { Db } from "../db/client";
import { apiKeys } from "../db/schema";
import { now } from "../db/schema/helpers";

// Org-scoped API keys. The ONE exception to org-scoping is `findByHash`, the
// authentication lookup: the token hash IS the org-establishing credential, so
// the query is by hash alone and returns the row (which carries the org).

export type ApiKey = typeof apiKeys.$inferSelect;

export interface ApiKeyCreate {
  orgId: string;
  name: string;
  tokenHash: string;
  prefix: string;
  createdByUserId: string;
  expiresAt?: number | null;
}

export function createApiKeysRepo(db: Db) {
  return {
    async create(input: ApiKeyCreate): Promise<ApiKey> {
      const [row] = await db
        .insert(apiKeys)
        .values({
          id: newId(),
          orgId: input.orgId,
          name: input.name,
          tokenHash: input.tokenHash,
          prefix: input.prefix,
          createdByUserId: input.createdByUserId,
          expiresAt: input.expiresAt ?? null,
        })
        .returning();
      return row;
    },

    /** Authentication lookup — by unique hash, across all orgs. */
    async findByHash(tokenHash: string): Promise<ApiKey | null> {
      const [row] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.tokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    },

    async listByOrg(orgId: string): Promise<ApiKey[]> {
      return db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.orgId, orgId))
        .orderBy(desc(apiKeys.createdAt));
    },

    async getById(orgId: string, id: string): Promise<ApiKey | null> {
      const [row] = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.id, id)))
        .limit(1);
      return row ?? null;
    },

    /** Mark a key revoked (org-scoped). Returns false if no such key. */
    async revoke(orgId: string, id: string): Promise<boolean> {
      const rows = await db
        .update(apiKeys)
        .set({ revokedAt: now(), updatedAt: now() })
        .where(
          and(
            eq(apiKeys.orgId, orgId),
            eq(apiKeys.id, id),
            // don't re-stamp an already-revoked key
          ),
        )
        .returning({ id: apiKeys.id });
      return rows.length > 0;
    },

    /** Stamp last-used (called from the hot auth path, throttled by the service). */
    async touchLastUsed(id: string, at: number): Promise<void> {
      await db
        .update(apiKeys)
        .set({ lastUsedAt: at })
        .where(eq(apiKeys.id, id));
    },
  };
}

export type ApiKeysRepo = ReturnType<typeof createApiKeysRepo>;
