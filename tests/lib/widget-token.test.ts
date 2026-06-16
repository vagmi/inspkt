import { describe, expect, it } from "vitest";
import {
  hasWidgetTokenFormat,
  mintWidgetToken,
  verifyWidgetToken,
} from "../../workers/api/lib/widget-token";

const SECRET = "widget-secret-1";
const NOW = 1_700_000_000;

describe("widget-token", () => {
  it("mints a well-formed token and round-trips its claims", async () => {
    const { token, exp } = await mintWidgetToken(SECRET, {
      orgId: "org_123",
      role: "manager",
      userId: "user_1",
      ttlSeconds: 900,
      nowSeconds: NOW,
    });
    expect(token).toMatch(/^inspktw_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(hasWidgetTokenFormat(token)).toBe(true);
    expect(exp).toBe(NOW + 900);

    const claims = await verifyWidgetToken(SECRET, token, NOW);
    expect(claims).toEqual({ orgId: "org_123", role: "manager", userId: "user_1", exp: NOW + 900 });
  });

  it("rejects a token signed with a different secret", async () => {
    const { token } = await mintWidgetToken(SECRET, {
      orgId: "org_123",
      role: "manager",
      userId: "user_1",
      ttlSeconds: 900,
      nowSeconds: NOW,
    });
    expect(await verifyWidgetToken("other-secret", token, NOW)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const { token } = await mintWidgetToken(SECRET, {
      orgId: "org_123",
      role: "manager",
      userId: "user_1",
      ttlSeconds: 900,
      nowSeconds: NOW,
    });
    // Flip the payload to claim a different org; signature no longer matches.
    const [, sig] = token.slice("inspktw_".length).split(".");
    const forgedPayload = btoa(JSON.stringify({ orgId: "org_evil", role: "manager", exp: NOW + 900 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const forged = `inspktw_${forgedPayload}.${sig}`;
    expect(await verifyWidgetToken(SECRET, forged, NOW)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { token, exp } = await mintWidgetToken(SECRET, {
      orgId: "org_123",
      role: "manager",
      userId: "user_1",
      ttlSeconds: 900,
      nowSeconds: NOW,
    });
    expect(await verifyWidgetToken(SECRET, token, exp)).toBeNull(); // exactly at exp
    expect(await verifyWidgetToken(SECRET, token, exp + 1)).toBeNull();
    expect(await verifyWidgetToken(SECRET, token, exp - 1)).not.toBeNull();
  });

  it("rejects malformed input without throwing", async () => {
    expect(hasWidgetTokenFormat("nope")).toBe(false);
    expect(hasWidgetTokenFormat("inspktw_nodot")).toBe(false);
    expect(await verifyWidgetToken(SECRET, "")).toBeNull();
    expect(await verifyWidgetToken(SECRET, "inspktw_.")).toBeNull();
    expect(await verifyWidgetToken(SECRET, "inspktw_abc.def")).toBeNull();
  });
});
