import { vi } from "vitest";
import type { Item } from "../../workers/api/repositories/items-repo";
import type { Organization } from "../../workers/api/repositories/organizations-repo";

export function fakeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org_test_1",
    name: "Test Org",
    slug: "test-org",
    plan: "free",
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockOrganizationsRepo() {
  return {
    getById: vi.fn(),
    ensure: vi.fn(),
    updateFromClerk: vi.fn(),
    delete: vi.fn(),
  };
}

export function fakeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item_1",
    orgId: "org_test_1",
    name: "First Item",
    description: "A sample item",
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockItemsRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    listByOrg: vi.fn(),
    countByOrg: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockItemsService() {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockUsageRepo() {
  return {
    getCount: vi.fn(),
    increment: vi.fn(),
    history: vi.fn(),
  };
}
