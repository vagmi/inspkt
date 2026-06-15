import { describe, expect, it } from "vitest";
import {
  generateToken,
  hasTokenFormat,
  hashToken,
  tokenPrefix,
} from "../../workers/api/lib/api-keys-crypto";

describe("api-keys crypto", () => {
  it("generates a well-formed token with a display prefix", () => {
    const { token, prefix } = generateToken();
    expect(hasTokenFormat(token)).toBe(true);
    expect(token).toMatch(/^inspkt_[0-9a-f]{64}$/);
    expect(prefix).toBe(tokenPrefix(token));
    expect(prefix).toMatch(/^inspkt_[0-9a-f]{8}$/);
    expect(token.startsWith(prefix)).toBe(true);
  });

  it("generates unique tokens", () => {
    const a = generateToken().token;
    const b = generateToken().token;
    expect(a).not.toBe(b);
  });

  it("rejects malformed tokens", () => {
    expect(hasTokenFormat("inspkt_short")).toBe(false);
    expect(hasTokenFormat("nope_" + "a".repeat(64))).toBe(false);
    expect(hasTokenFormat("inspkt_" + "Z".repeat(64))).toBe(false); // non-hex
    expect(hasTokenFormat("")).toBe(false);
  });

  it("hashes deterministically for a given pepper", async () => {
    const token = generateToken().token;
    const h1 = await hashToken("pepper-1", token);
    const h2 = await hashToken("pepper-1", token);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it("produces a different hash under a different pepper", async () => {
    const token = generateToken().token;
    const a = await hashToken("pepper-1", token);
    const b = await hashToken("pepper-2", token);
    expect(a).not.toBe(b);
  });
});
