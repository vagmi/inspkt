import { describe, expect, it } from "vitest";
import {
  actorFromRole,
  can,
  landingPath,
  seedRoleFromProvider,
} from "../../app/lib/capabilities";

const admin = actorFromRole("admin");
const manager = actorFromRole("manager");
const inspector = actorFromRole("inspector");
const none = actorFromRole(null);
const garbage = actorFromRole("org:admin"); // a provider role is NOT an app role

describe("actorFromRole", () => {
  it("maps a valid app role and rejects everything else", () => {
    expect(admin.role).toBe("admin");
    expect(none.role).toBeNull();
    // a provider-style role string is not a valid app role → powerless
    expect(garbage.role).toBeNull();
    expect(can.inspect(garbage)).toBe(false);
  });
});

describe("capabilities by role", () => {
  it("inspect / viewMembers: every member", () => {
    for (const a of [admin, manager, inspector]) {
      expect(can.inspect(a)).toBe(true);
      expect(can.viewMembers(a)).toBe(true);
    }
    expect(can.inspect(none)).toBe(false);
  });

  it("setup / assign / oversee: admins and managers only", () => {
    for (const cap of [can.setup, can.assign, can.oversee]) {
      expect(cap(admin)).toBe(true);
      expect(cap(manager)).toBe(true);
      expect(cap(inspector)).toBe(false);
      expect(cap(none)).toBe(false);
    }
  });

  it("manageRoles / removeMember / manageOrg: admins only", () => {
    for (const cap of [can.manageRoles, can.removeMember, can.manageOrg]) {
      expect(cap(admin)).toBe(true);
      expect(cap(manager)).toBe(false);
      expect(cap(inspector)).toBe(false);
    }
  });
});

describe("landingPath", () => {
  it("sends managers/admins to setup, inspectors to their work", () => {
    expect(landingPath(admin)).toBe("/app");
    expect(landingPath(manager)).toBe("/app");
    expect(landingPath(inspector)).toBe("/app/inspections");
  });
});

describe("seedRoleFromProvider", () => {
  it("maps the provider's org:admin to admin, everything else to inspector", () => {
    expect(seedRoleFromProvider("org:admin")).toBe("admin");
    expect(seedRoleFromProvider("org:member")).toBe("inspector");
    expect(seedRoleFromProvider(null)).toBe("inspector");
  });
});
