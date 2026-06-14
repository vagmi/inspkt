import { describe, expect, it } from "vitest";
import { createInspectionsService } from "../../workers/api/services/inspections-service";
import {
  NotFoundError,
  ValidationError,
} from "../../workers/api/services/errors";
import {
  fakeCheckpoint,
  fakeForm,
  fakeInspection,
  fakeFacility,
  fakeObservation,
  mockFormsRepo,
  mockInspectionsRepo,
  mockFacilitiesRepo,
} from "../helpers/mocks";

const ORG = "org_test_1";
const USER = "user_test_1";

function makeService() {
  const inspectionsRepo = mockInspectionsRepo();
  const facilitiesRepo = mockFacilitiesRepo();
  const formsRepo = mockFormsRepo();
  const service = createInspectionsService({
    inspectionsRepo,
    facilitiesRepo,
    formsRepo,
  });
  return { service, inspectionsRepo, facilitiesRepo, formsRepo };
}

/** A form with one pass/fail checkpoint, configurable. */
function formWith(...checkpoints: ReturnType<typeof fakeCheckpoint>[]) {
  return { ...fakeForm(), checkpoints };
}

describe("inspections service", () => {
  describe("create", () => {
    it("creates a draft when facility and form exist", async () => {
      const { service, inspectionsRepo, facilitiesRepo, formsRepo } = makeService();
      facilitiesRepo.getById.mockResolvedValue(fakeFacility());
      formsRepo.getById.mockResolvedValue(formWith(fakeCheckpoint()));
      inspectionsRepo.create.mockResolvedValue({
        ...fakeInspection(),
        observations: [],
      });

      const detail = await service.create(ORG, USER, {
        facilityId: "facility_1",
        formId: "form_1",
      });
      expect(detail.status).toBe("draft");
      expect(inspectionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG,
          inspectorUserId: USER,
          facilityId: "facility_1",
          formId: "form_1",
        }),
      );
    });

    it("throws NotFound when the facility is missing", async () => {
      const { service, facilitiesRepo, formsRepo } = makeService();
      facilitiesRepo.getById.mockResolvedValue(null);
      formsRepo.getById.mockResolvedValue(formWith());

      await expect(
        service.create(ORG, USER, { facilityId: "nope", formId: "form_1" }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("get — location mismatch", () => {
    it("flags a capture far from the facility's registered location", async () => {
      const { service, inspectionsRepo, facilitiesRepo, formsRepo } = makeService();
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection({ capturedLat: 13.05, capturedLng: 77.7 }),
        observations: [],
      });
      facilitiesRepo.getById.mockResolvedValue(
        fakeFacility({ locationLat: 12.97, locationLng: 77.59 }),
      );
      formsRepo.getById.mockResolvedValue(formWith());

      const detail = await service.get(ORG, "insp_1");
      expect(detail.locationDistanceMeters).toBeGreaterThan(500);
      expect(detail.locationMismatch).toBe(true);
    });

    it("does not flag when locations are close, and is null without coords", async () => {
      const { service, inspectionsRepo, facilitiesRepo, formsRepo } = makeService();
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection({ capturedLat: null, capturedLng: null }),
        observations: [],
      });
      facilitiesRepo.getById.mockResolvedValue(fakeFacility());
      formsRepo.getById.mockResolvedValue(formWith());

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
      const { service, inspectionsRepo, facilitiesRepo, formsRepo } = makeService();
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
      facilitiesRepo.getById.mockResolvedValue(fakeFacility());
      inspectionsRepo.markSubmitted.mockResolvedValue(
        fakeInspection({ status: "submitted" }),
      );

      const detail = await service.submit(ORG, "insp_1", []);
      expect(inspectionsRepo.saveObservations).toHaveBeenCalled();
      expect(inspectionsRepo.markSubmitted).toHaveBeenCalledWith(ORG, "insp_1");
      expect(detail).toBeTruthy();
    });

    it("ignores observation-type checkpoints in the answered gate", async () => {
      const { service, inspectionsRepo, facilitiesRepo, formsRepo } = makeService();
      const cp = fakeCheckpoint({ id: "cp_obs", answerType: "observation" });
      inspectionsRepo.getById.mockResolvedValue({
        ...fakeInspection(),
        observations: [], // observation checkpoints need no answer
      });
      formsRepo.getById.mockResolvedValue(formWith(cp));
      facilitiesRepo.getById.mockResolvedValue(fakeFacility());
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
