import { describe, expect, it } from "vitest";
import { createInspectionsService } from "../../workers/api/services/inspections-service";
import {
  NotFoundError,
  ValidationError,
} from "../../workers/api/services/errors";
import {
  fakeCheckpoint,
  fakeClient,
  fakeEquipment,
  fakeEquipmentType,
  fakeForm,
  fakeInspection,
  fakeFacility,
  fakeObservation,
  mockClientsRepo,
  mockEquipmentRepo,
  mockEquipmentTypesRepo,
  mockFormsRepo,
  mockInspectionsRepo,
  mockFacilitiesRepo,
} from "../helpers/mocks";

const ORG = "org_test_1";
const USER = "user_test_1";

function makeService() {
  const inspectionsRepo = mockInspectionsRepo();
  const equipmentRepo = mockEquipmentRepo();
  const equipmentTypesRepo = mockEquipmentTypesRepo();
  const facilitiesRepo = mockFacilitiesRepo();
  const clientsRepo = mockClientsRepo();
  const formsRepo = mockFormsRepo();
  const service = createInspectionsService({
    inspectionsRepo,
    equipmentRepo,
    equipmentTypesRepo,
    facilitiesRepo,
    clientsRepo,
    formsRepo,
  });
  return {
    service,
    inspectionsRepo,
    equipmentRepo,
    equipmentTypesRepo,
    facilitiesRepo,
    clientsRepo,
    formsRepo,
  };
}

/** A form with one pass/fail checkpoint, configurable. */
function formWith(...checkpoints: ReturnType<typeof fakeCheckpoint>[]) {
  return { ...fakeForm(), checkpoints };
}

/** An equipment type that offers the given form ids as its rubrics. */
function typeOffering(...formIds: string[]) {
  return {
    ...fakeEquipmentType({ id: "type_1" }),
    forms: formIds.map((id) => ({ id, name: id })),
  };
}

/** Wire the loadDetail dependencies so get/submit can resolve a detail. */
function stubDetailDeps(deps: ReturnType<typeof makeService>) {
  deps.equipmentRepo.getById.mockResolvedValue(fakeEquipment());
  deps.facilitiesRepo.getById.mockResolvedValue(fakeFacility());
  deps.clientsRepo.getById.mockResolvedValue(fakeClient());
}

describe("inspections service", () => {
  describe("create", () => {
    it("creates a draft when the form is one of the equipment type's forms", async () => {
      const deps = makeService();
      const { service, inspectionsRepo, equipmentRepo, equipmentTypesRepo } =
        deps;
      equipmentRepo.getById.mockResolvedValue(
        fakeEquipment({ typeId: "type_1", facilityId: "facility_1" }),
      );
      equipmentTypesRepo.getById.mockResolvedValue(typeOffering("form_1"));
      // loadDetail deps
      deps.formsRepo.getById.mockResolvedValue(formWith(fakeCheckpoint()));
      deps.facilitiesRepo.getById.mockResolvedValue(fakeFacility());
      deps.clientsRepo.getById.mockResolvedValue(fakeClient());
      inspectionsRepo.create.mockResolvedValue({
        ...fakeInspection(),
        observations: [],
      });

      const detail = await service.create(ORG, USER, {
        equipmentId: "equip_1",
        formId: "form_1",
      });
      expect(detail.status).toBe("draft");
      // facility is snapshotted from the equipment
      expect(inspectionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG,
          inspectorUserId: USER,
          equipmentId: "equip_1",
          facilityId: "facility_1",
          formId: "form_1",
        }),
      );
    });

    it("snapshots a null facility for mobile equipment", async () => {
      const deps = makeService();
      const { service, inspectionsRepo, equipmentRepo, equipmentTypesRepo } =
        deps;
      equipmentRepo.getById.mockResolvedValue(
        fakeEquipment({ typeId: "type_1", facilityId: null }),
      );
      equipmentTypesRepo.getById.mockResolvedValue(typeOffering("form_1"));
      deps.formsRepo.getById.mockResolvedValue(formWith());
      deps.facilitiesRepo.getById.mockResolvedValue(fakeFacility());
      deps.clientsRepo.getById.mockResolvedValue(fakeClient());
      inspectionsRepo.create.mockResolvedValue({
        ...fakeInspection({ facilityId: null }),
        observations: [],
      });

      await service.create(ORG, USER, {
        equipmentId: "equip_1",
        formId: "form_1",
      });
      expect(inspectionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ facilityId: null }),
      );
    });

    it("throws NotFound when the equipment is missing", async () => {
      const { service, equipmentRepo } = makeService();
      equipmentRepo.getById.mockResolvedValue(null);

      await expect(
        service.create(ORG, USER, { equipmentId: "nope", formId: "form_1" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects a form that isn't one of the equipment type's forms", async () => {
      const { service, inspectionsRepo, equipmentRepo, equipmentTypesRepo } =
        makeService();
      equipmentRepo.getById.mockResolvedValue(
        fakeEquipment({ typeId: "type_1" }),
      );
      equipmentTypesRepo.getById.mockResolvedValue(typeOffering("other_form"));

      await expect(
        service.create(ORG, USER, { equipmentId: "equip_1", formId: "form_1" }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(inspectionsRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("get — location mismatch", () => {
    it("flags a capture far from the facility's location when the equipment has none", async () => {
      const deps = makeService();
      const { service, inspectionsRepo, equipmentRepo, facilitiesRepo } = deps;
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection({ capturedLat: 13.05, capturedLng: 77.7 }),
        observations: [],
      });
      equipmentRepo.getById.mockResolvedValue(fakeEquipment()); // no own location
      facilitiesRepo.getById.mockResolvedValue(
        fakeFacility({ locationLat: 12.97, locationLng: 77.59 }),
      );
      deps.clientsRepo.getById.mockResolvedValue(fakeClient());
      deps.formsRepo.getById.mockResolvedValue(formWith());

      const detail = await service.get(ORG, "insp_1");
      expect(detail.locationDistanceMeters).toBeGreaterThan(500);
      expect(detail.locationMismatch).toBe(true);
    });

    it("prefers the equipment's own location over the facility's", async () => {
      const deps = makeService();
      const { service, inspectionsRepo, equipmentRepo, facilitiesRepo } = deps;
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection({ capturedLat: 12.97, capturedLng: 77.59 }),
        observations: [],
      });
      // equipment sits right at the capture; facility is far away — equipment wins
      equipmentRepo.getById.mockResolvedValue(
        fakeEquipment({ locationLat: 12.97, locationLng: 77.59 }),
      );
      facilitiesRepo.getById.mockResolvedValue(
        fakeFacility({ locationLat: 13.05, locationLng: 77.7 }),
      );
      deps.clientsRepo.getById.mockResolvedValue(fakeClient());
      deps.formsRepo.getById.mockResolvedValue(formWith());

      const detail = await service.get(ORG, "insp_1");
      expect(detail.locationDistanceMeters).toBeLessThan(100);
      expect(detail.locationMismatch).toBe(false);
    });

    it("is null without captured coords", async () => {
      const deps = makeService();
      const { service, inspectionsRepo } = deps;
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection({ capturedLat: null, capturedLng: null }),
        observations: [],
      });
      stubDetailDeps(deps);
      deps.formsRepo.getById.mockResolvedValue(formWith());

      const detail = await service.get(ORG, "insp_1");
      expect(detail.locationDistanceMeters).toBeNull();
      expect(detail.locationMismatch).toBe(false);
    });
  });

  describe("saveDraft", () => {
    it("rejects edits to a submitted inspection", async () => {
      const { service, inspectionsRepo } = makeService();
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection({ status: "submitted" }),
        observations: [],
      });

      await expect(
        service.saveDraft(ORG, "insp_1", []),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(inspectionsRepo.saveObservations).not.toHaveBeenCalled();
    });
  });

  describe("submit", () => {
    it("blocks when a judged checkpoint is unanswered", async () => {
      const { service, inspectionsRepo, formsRepo } = makeService();
      const cp = fakeCheckpoint({ id: "cp_1", answerType: "pass_fail" });
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection(),
        observations: [], // nothing answered
      });
      formsRepo.getById.mockResolvedValue(formWith(cp));

      await expect(service.submit(ORG, "insp_1", [])).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(inspectionsRepo.markSubmitted).not.toHaveBeenCalled();
    });

    it("blocks when a photo-required checkpoint has no photo", async () => {
      const { service, inspectionsRepo, formsRepo } = makeService();
      const cp = fakeCheckpoint({
        id: "cp_1",
        answerType: "pass_fail",
        photoRequired: true,
      });
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection(),
        observations: [
          fakeObservation({
            checkpointId: "cp_1",
            answer: { type: "pass_fail", pass: true },
            photoKeys: null,
          }),
        ],
      });
      formsRepo.getById.mockResolvedValue(formWith(cp));

      await expect(service.submit(ORG, "insp_1", [])).rejects.toBeInstanceOf(
        ValidationError,
      );
    });

    it("submits when every judged checkpoint is answered and photos present", async () => {
      const deps = makeService();
      const { service, inspectionsRepo, formsRepo } = deps;
      const cp = fakeCheckpoint({
        id: "cp_1",
        answerType: "pass_fail",
        photoRequired: true,
      });
      const answered = {
        ...fakeInspection(),
        observations: [
          fakeObservation({
            checkpointId: "cp_1",
            answer: { type: "pass_fail", pass: true },
            photoKeys: ["org_test_1/x.jpg"],
          }),
        ],
      };
      // getById is called repeatedly (load, after save, final load)
      inspectionsRepo.getById.mockResolvedValue(answered);
      formsRepo.getById.mockResolvedValue(formWith(cp));
      stubDetailDeps(deps);
      inspectionsRepo.markSubmitted.mockResolvedValue(
        fakeInspection({ status: "submitted" }),
      );

      const detail = await service.submit(ORG, "insp_1", []);
      expect(inspectionsRepo.saveObservations).toHaveBeenCalled();
      expect(inspectionsRepo.markSubmitted).toHaveBeenCalledWith(ORG, "insp_1");
      expect(detail).toBeTruthy();
    });

    it("ignores observation-type checkpoints in the answered gate", async () => {
      const deps = makeService();
      const { service, inspectionsRepo, formsRepo } = deps;
      const cp = fakeCheckpoint({ id: "cp_obs", answerType: "observation" });
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection(),
        observations: [], // observation checkpoints need no answer
      });
      formsRepo.getById.mockResolvedValue(formWith(cp));
      stubDetailDeps(deps);
      inspectionsRepo.markSubmitted.mockResolvedValue(
        fakeInspection({ status: "submitted" }),
      );

      await expect(service.submit(ORG, "insp_1", [])).resolves.toBeTruthy();
    });
  });

  it("delete throws NotFound when nothing was deleted", async () => {
    const { service, inspectionsRepo } = makeService();
    inspectionsRepo.delete.mockResolvedValue(false);
    await expect(service.delete(ORG, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
