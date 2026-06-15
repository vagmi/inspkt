import { vi } from "vitest";
import type { Client } from "../../workers/api/repositories/clients-repo";
import type { Equipment } from "../../workers/api/repositories/equipment-repo";
import type { EquipmentType } from "../../workers/api/repositories/equipment-types-repo";
import type {
  Checkpoint,
  Form,
} from "../../workers/api/repositories/forms-repo";
import type {
  Inspection,
  Observation,
} from "../../workers/api/repositories/inspections-repo";
import type { Facility } from "../../workers/api/repositories/facilities-repo";
import type { Membership } from "../../workers/api/repositories/memberships-repo";
import type { Organization } from "../../workers/api/repositories/organizations-repo";
import type { User } from "../../workers/api/repositories/users-repo";

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

export function fakeFacility(overrides: Partial<Facility> = {}): Facility {
  return {
    id: "facility_1",
    orgId: "org_test_1",
    clientId: "client_1",
    name: "First Facility",
    description: "A sample facility",
    category: null,
    locationLat: null,
    locationLng: null,
    locationLabel: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockFacilitiesRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    listByOrg: vi.fn(),
    countByOrg: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockFacilitiesService() {
  return {
    list: vi.fn(),
    listByClient: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function fakeForm(overrides: Partial<Form> = {}): Form {
  return {
    id: "form_1",
    orgId: "org_test_1",
    name: "Quarterly HVAC Check",
    description: "Standard quarterly rubric",
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function fakeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: "cp_1",
    formId: "form_1",
    orgId: "org_test_1",
    position: 0,
    section: null,
    prompt: "Condenser coils free of debris",
    answerType: "pass_fail",
    severity: "minor",
    critical: false,
    photoRequired: false,
    config: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockFormsRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    listByOrg: vi.fn(),
    countByOrg: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockFormsService() {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function fakeInspection(
  overrides: Partial<Inspection> = {},
): Inspection {
  return {
    id: "insp_1",
    orgId: "org_test_1",
    facilityId: "facility_1",
    formId: "form_1",
    inspectorUserId: "user_test_1",
    status: "draft",
    capturedLat: null,
    capturedLng: null,
    submittedAt: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function fakeObservation(
  overrides: Partial<Observation> = {},
): Observation {
  return {
    id: "obs_1",
    orgId: "org_test_1",
    inspectionId: "insp_1",
    checkpointId: "cp_1",
    answer: { type: "pass_fail", pass: true },
    note: null,
    photoKeys: null,
    capturedLat: null,
    capturedLng: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockInspectionsRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    listByOrg: vi.fn(),
    saveObservations: vi.fn(),
    markSubmitted: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockInspectionsService() {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    saveDraft: vi.fn(),
    submit: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockUploadsService() {
  return {
    put: vi.fn(),
    delete: vi.fn(),
  };
}

export function fakeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: "client_1",
    orgId: "org_test_1",
    name: "Acme Properties",
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    notes: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockClientsRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    listByOrg: vi.fn(),
    countByOrg: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockClientsService() {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function fakeEquipmentType(
  overrides: Partial<EquipmentType> = {},
): EquipmentType {
  return {
    id: "type_1",
    orgId: "org_test_1",
    name: "Rooftop HVAC",
    description: null,
    fields: [],
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function fakeEquipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "equip_1",
    orgId: "org_test_1",
    clientId: "client_1",
    facilityId: "facility_1",
    typeId: "type_1",
    name: "Unit A-1",
    identifier: null,
    metadata: {},
    locationLat: null,
    locationLng: null,
    locationLabel: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockEquipmentTypesRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    listByOrg: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockEquipmentTypesService() {
  return {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockEquipmentRepo() {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    listByOrg: vi.fn(),
    listByFacility: vi.fn(),
    countByOrg: vi.fn(),
    countByType: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function mockEquipmentService() {
  return {
    list: vi.fn(),
    listByFacility: vi.fn(),
    listByClient: vi.fn(),
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

export function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user_test_1",
    email: "user@example.com",
    firstName: "Test",
    lastName: "User",
    imageUrl: null,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockUsersRepo() {
  return {
    getById: vi.fn(),
    ensure: vi.fn(),
    upsert: vi.fn(),
    updateFromClerk: vi.fn(),
    delete: vi.fn(),
  };
}

export function fakeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    orgId: "org_test_1",
    userId: "user_test_1",
    role: "admin",
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
    ...overrides,
  };
}

export function mockMembershipsRepo() {
  return {
    get: vi.fn(),
    ensureExists: vi.fn(),
    setRole: vi.fn(),
    countByRole: vi.fn(),
    listByOrg: vi.fn(),
    reconcile: vi.fn(),
    remove: vi.fn(),
  };
}

export function mockUsersService() {
  return {
    ensureUser: vi.fn(),
    getById: vi.fn(),
    syncFromClerk: vi.fn(),
  };
}

export function mockMembersService() {
  return {
    ensureMembership: vi.fn(),
    listMembers: vi.fn(),
    setMemberRole: vi.fn(),
    removeMember: vi.fn(),
    syncFromClerk: vi.fn(),
  };
}
