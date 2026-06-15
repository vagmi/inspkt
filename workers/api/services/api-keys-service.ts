import { now } from "../db/schema/helpers";
import {
  generateToken,
  hasTokenFormat,
  hashToken,
} from "../lib/api-keys-crypto";
import type { ApiKey, ApiKeysRepo } from "../repositories/api-keys-repo";
import type { Organization, OrganizationsRepo } from "../repositories/organizations-repo";
import { NotFoundError } from "./errors";

// API keys: machine credentials for an org's write API. The plaintext token is
// returned exactly once (on create) and never stored — only its peppered HMAC.
// `authenticate` is on the request hot path, so it does at most one extra write
// (throttled last-used stamp).

/** Don't restamp last-used more often than this (seconds). */
const TOUCH_THROTTLE_S = 60;

/** What a successful authentication resolves to for the middleware. */
export interface ApiKeyAuth {
  org: Organization;
  createdByUserId: string;
  apiKeyId: string;
}

export interface ApiKeysServiceDeps {
  apiKeysRepo: ApiKeysRepo;
  orgsRepo: OrganizationsRepo;
  /** Server-side HMAC pepper from the environment. */
  pepper: string;
}

export function createApiKeysService({
  apiKeysRepo,
  orgsRepo,
  pepper,
}: ApiKeysServiceDeps) {
  return {
    list(orgId: string): Promise<ApiKey[]> {
      return apiKeysRepo.listByOrg(orgId);
    },

    /** Mint a key. Returns the stored row AND the plaintext token — the only
     * time the token is ever available. */
    async create(
      orgId: string,
      createdByUserId: string,
      input: { name: string; expiresAt?: number | null },
    ): Promise<{ apiKey: ApiKey; token: string }> {
      const { token, prefix } = generateToken();
      const tokenHash = await hashToken(pepper, token);
      const apiKey = await apiKeysRepo.create({
        orgId,
        name: input.name,
        tokenHash,
        prefix,
        createdByUserId,
        expiresAt: input.expiresAt ?? null,
      });
      return { apiKey, token };
    },

    async revoke(orgId: string, id: string): Promise<void> {
      const ok = await apiKeysRepo.revoke(orgId, id);
      if (!ok) throw new NotFoundError(`api key ${id} not found`);
    },

    /** Resolve a Bearer token to its org + creator, or null if it's invalid,
     * unknown, revoked, or expired. Stamps last-used (throttled). */
    async authenticate(token: string): Promise<ApiKeyAuth | null> {
      if (!hasTokenFormat(token)) return null;
      const tokenHash = await hashToken(pepper, token);
      const row = await apiKeysRepo.findByHash(tokenHash);
      if (!row) return null;
      if (row.revokedAt != null) return null;

      const nowS = now();
      if (row.expiresAt != null && nowS >= row.expiresAt) return null;

      const org = await orgsRepo.getById(row.orgId);
      if (!org) return null;

      if (row.lastUsedAt == null || nowS - row.lastUsedAt > TOUCH_THROTTLE_S) {
        await apiKeysRepo.touchLastUsed(row.id, nowS);
      }
      return { org, createdByUserId: row.createdByUserId, apiKeyId: row.id };
    },
  };
}

export type ApiKeysService = ReturnType<typeof createApiKeysService>;
