import { describe, expect, it } from "vitest";
import { hashToken } from "../../workers/api/lib/api-keys-crypto";
import { createApiKeysService } from "../../workers/api/services/api-keys-service";
import { NotFoundError } from "../../workers/api/services/errors";
import {
  fakeApiKey,
  fakeOrg,
  mockApiKeysRepo,
  mockOrganizationsRepo,
} from "../helpers/mocks";

const ORG = "org_test_1";
const PEPPER = "test-pepper";

function makeService() {
  const apiKeysRepo = mockApiKeysRepo();
  const orgsRepo = mockOrganizationsRepo();
  const service = createApiKeysService({ apiKeysRepo, orgsRepo, pepper: PEPPER });
  return { service, apiKeysRepo, orgsRepo };
}

const nowS = () => Math.floor(Date.now() / 1000);

describe("api keys service", () => {
  describe("create", () => {
    it("returns a one-time token and stores its peppered hash", async () => {
      const { service, apiKeysRepo } = makeService();
      apiKeysRepo.create.mockImplementation(async (input) =>
        fakeApiKey({ ...input }),
      );

      const { token } = await service.create(ORG, "user_test_1", {
        name: "CI",
      });
      expect(token).toMatch(/^inspkt_[0-9a-f]{64}$/);

      const [input] = apiKeysRepo.create.mock.calls[0];
      expect(input.orgId).toBe(ORG);
      expect(input.createdByUserId).toBe("user_test_1");
      // The stored hash is the peppered HMAC of the issued token (never the token).
      expect(input.tokenHash).toBe(await hashToken(PEPPER, token));
      expect(input.tokenHash).not.toContain(token);
      expect(token.startsWith(input.prefix)).toBe(true);
    });
  });

  describe("authenticate", () => {
    async function tokenAndHash() {
      // A valid-format token plus the hash the service will look up by.
      const token = `inspkt_${"a".repeat(64)}`;
      return { token, hash: await hashToken(PEPPER, token) };
    }

    it("rejects a malformed token without hitting the repo", async () => {
      const { service, apiKeysRepo } = makeService();
      expect(await service.authenticate("not-a-token")).toBeNull();
      expect(apiKeysRepo.findByHash).not.toHaveBeenCalled();
    });

    it("rejects an unknown token", async () => {
      const { service, apiKeysRepo } = makeService();
      const { token } = await tokenAndHash();
      apiKeysRepo.findByHash.mockResolvedValue(null);
      expect(await service.authenticate(token)).toBeNull();
    });

    it("rejects a revoked key", async () => {
      const { service, apiKeysRepo, orgsRepo } = makeService();
      const { token } = await tokenAndHash();
      apiKeysRepo.findByHash.mockResolvedValue(fakeApiKey({ revokedAt: 123 }));
      expect(await service.authenticate(token)).toBeNull();
      expect(orgsRepo.getById).not.toHaveBeenCalled();
    });

    it("rejects an expired key", async () => {
      const { service, apiKeysRepo } = makeService();
      const { token } = await tokenAndHash();
      apiKeysRepo.findByHash.mockResolvedValue(
        fakeApiKey({ expiresAt: 1 }), // long past
      );
      expect(await service.authenticate(token)).toBeNull();
    });

    it("resolves org + creator and stamps last-used when stale", async () => {
      const { service, apiKeysRepo, orgsRepo } = makeService();
      const { token, hash } = await tokenAndHash();
      apiKeysRepo.findByHash.mockResolvedValue(
        fakeApiKey({ orgId: ORG, createdByUserId: "user_test_1", lastUsedAt: null }),
      );
      orgsRepo.getById.mockResolvedValue(fakeOrg({ id: ORG }));

      const auth = await service.authenticate(token);
      expect(auth?.org.id).toBe(ORG);
      expect(auth?.createdByUserId).toBe("user_test_1");
      expect(apiKeysRepo.findByHash).toHaveBeenCalledWith(hash);
      expect(apiKeysRepo.touchLastUsed).toHaveBeenCalled();
    });

    it("does not restamp last-used within the throttle window", async () => {
      const { service, apiKeysRepo, orgsRepo } = makeService();
      const { token } = await tokenAndHash();
      apiKeysRepo.findByHash.mockResolvedValue(
        fakeApiKey({ lastUsedAt: nowS() }), // used just now
      );
      orgsRepo.getById.mockResolvedValue(fakeOrg());

      await service.authenticate(token);
      expect(apiKeysRepo.touchLastUsed).not.toHaveBeenCalled();
    });
  });

  describe("revoke", () => {
    it("throws NotFound when the key doesn't exist", async () => {
      const { service, apiKeysRepo } = makeService();
      apiKeysRepo.revoke.mockResolvedValue(false);
      await expect(service.revoke(ORG, "nope")).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
