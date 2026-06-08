import { describe, expect, it } from "vitest";
import { actorFromAuth, can, type Actor } from "../../app/lib/capabilities";

/** Build an Actor whose `has` honors a set of granted roles/permissions. */
function actor(granted: { roles?: string[]; permissions?: string[] }): Actor {
  return actorFromAuth({
    orgRole: granted.roles?.[0] ?? null,
    has: (params: { role?: string; permission?: string }) =>
      (params.role ? (granted.roles ?? []).includes(params.role) : false) ||
      (params.permission
        ? (granted.permissions ?? []).includes(params.permission)
        : false),
  });
}

const admin = actor({ roles: ["org:admin"] });
const member = actor({ roles: ["org:member"] });
const anon = actorFromAuth(null);

describe("actorFromAuth", () => {
  it("defaults a null auth to a powerless actor", () => {
    expect(anon.orgRole).toBeNull();
    expect(anon.has({ role: "org:admin" })).toBe(false);
  });
});

describe("can.viewMembers", () => {
  it("allows any member, denies nobody who is in the org", () => {
    expect(can.viewMembers(admin)).toBe(true);
    expect(can.viewMembers(member)).toBe(true);
  });
});

describe("can.removeMember", () => {
  it("allows admins only", () => {
    expect(can.removeMember(admin)).toBe(true);
  });

  it("denies non-admins", () => {
    expect(can.removeMember(member)).toBe(false);
    expect(can.removeMember(anon)).toBe(false);
  });
});

// When you uncomment a capability template in app/lib/capabilities.ts, add its
// test here so the policy stays covered.
