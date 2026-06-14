import type { Facility, FacilitiesRepo } from "../repositories/facilities-repo";
import type { FormWithCheckpoints, FormsRepo } from "../repositories/forms-repo";
import type {
  InspectionCreate,
  InspectionListRow,
  InspectionWithObservations,
  InspectionsRepo,
  ObservationInput,
} from "../repositories/inspections-repo";
import { NotFoundError, ValidationError } from "./errors";
import { LOCATION_MISMATCH_THRESHOLD_M, haversineMeters } from "./geo";

// Inspections own the capture lifecycle: create a draft, save observations as
// the inspector works, and submit to finalize. The verdict engine plugs into
// submit() in Phase 11 — for now submit only enforces completeness and flips
// the status.

export interface InspectionsServiceDeps {
  inspectionsRepo: InspectionsRepo;
  facilitiesRepo: FacilitiesRepo;
  formsRepo: FormsRepo;
}

/** A draft/submitted inspection joined with the form being walked, the facility
 * under inspection, and a computed location-mismatch distance. */
export interface InspectionDetail extends InspectionWithObservations {
  form: FormWithCheckpoints;
  facility: Facility;
  /** Metres between captured and registered location, or null if either is
   * absent. `locationMismatch` is true past the threshold. */
  locationDistanceMeters: number | null;
  locationMismatch: boolean;
}

export function createInspectionsService({
  inspectionsRepo,
  facilitiesRepo,
  formsRepo,
}: InspectionsServiceDeps) {
  async function loadDetail(
    orgId: string,
    inspection: InspectionWithObservations,
  ): Promise<InspectionDetail> {
    const [form, facility] = await Promise.all([
      formsRepo.getById(orgId, inspection.formId),
      facilitiesRepo.getById(orgId, inspection.facilityId),
    ]);
    if (!form) throw new NotFoundError(`form ${inspection.formId} not found`);
    if (!facility)
      throw new NotFoundError(`facility ${inspection.facilityId} not found`);

    let distance: number | null = null;
    if (
      inspection.capturedLat != null &&
      inspection.capturedLng != null &&
      facility.locationLat != null &&
      facility.locationLng != null
    ) {
      distance = haversineMeters(
        inspection.capturedLat,
        inspection.capturedLng,
        facility.locationLat,
        facility.locationLng,
      );
    }
    return {
      ...inspection,
      form,
      facility,
      locationDistanceMeters: distance,
      locationMismatch:
        distance != null && distance > LOCATION_MISMATCH_THRESHOLD_M,
    };
  }

  async function getOrThrow(
    orgId: string,
    id: string,
  ): Promise<InspectionWithObservations> {
    const inspection = await inspectionsRepo.getById(orgId, id);
    if (!inspection) throw new NotFoundError(`inspection ${id} not found`);
    return inspection;
  }

  return {
    list(orgId: string): Promise<InspectionListRow[]> {
      return inspectionsRepo.listByOrg(orgId);
    },

    async get(orgId: string, id: string): Promise<InspectionDetail> {
      return loadDetail(orgId, await getOrThrow(orgId, id));
    },

    /** Start a draft. Validates the facility and form both belong to the org. */
    async create(
      orgId: string,
      inspectorUserId: string,
      input: Pick<InspectionCreate, "facilityId" | "formId"> & {
        capturedLat?: number | null;
        capturedLng?: number | null;
      },
    ): Promise<InspectionDetail> {
      const [facility, form] = await Promise.all([
        facilitiesRepo.getById(orgId, input.facilityId),
        formsRepo.getById(orgId, input.formId),
      ]);
      if (!facility)
        throw new NotFoundError(`facility ${input.facilityId} not found`);
      if (!form) throw new NotFoundError(`form ${input.formId} not found`);

      const created = await inspectionsRepo.create({
        orgId,
        facilityId: input.facilityId,
        formId: input.formId,
        inspectorUserId,
        capturedLat: input.capturedLat ?? null,
        capturedLng: input.capturedLng ?? null,
      });
      return loadDetail(orgId, created);
    },

    /** Save progress on a draft. Submitted inspections are immutable. */
    async saveDraft(
      orgId: string,
      id: string,
      observations: ObservationInput[],
    ): Promise<InspectionDetail> {
      const inspection = await getOrThrow(orgId, id);
      if (inspection.status !== "draft") {
        throw new ValidationError("a submitted inspection cannot be edited");
      }
      await inspectionsRepo.saveObservations(orgId, id, observations);
      return loadDetail(orgId, await getOrThrow(orgId, id));
    },

    /** Finalize: persist the latest answers, enforce completeness, flip status.
     * Throws ValidationError listing every checkpoint that blocks submission. */
    async submit(
      orgId: string,
      id: string,
      observations: ObservationInput[],
    ): Promise<InspectionDetail> {
      const inspection = await getOrThrow(orgId, id);
      if (inspection.status !== "draft") {
        throw new ValidationError("this inspection is already submitted");
      }
      await inspectionsRepo.saveObservations(orgId, id, observations);

      const form = await formsRepo.getById(orgId, inspection.formId);
      if (!form) throw new NotFoundError(`form ${inspection.formId} not found`);
      const saved = await getOrThrow(orgId, id);
      const byCheckpoint = new Map(
        saved.observations.map((o) => [o.checkpointId, o]),
      );

      const problems: string[] = [];
      for (const cp of form.checkpoints) {
        const obs = byCheckpoint.get(cp.id);
        // Judged checkpoints must be answered.
        if (cp.answerType !== "observation") {
          if (!obs || obs.answer == null) {
            problems.push(`"${cp.prompt}" needs an answer`);
            continue;
          }
        }
        // Photo-required checkpoints must carry at least one photo.
        if (cp.photoRequired && !(obs?.photoKeys && obs.photoKeys.length > 0)) {
          problems.push(`"${cp.prompt}" requires a photo`);
        }
      }
      if (problems.length > 0) {
        throw new ValidationError(
          `cannot submit yet: ${problems.join("; ")}`,
          problems,
        );
      }

      await inspectionsRepo.markSubmitted(orgId, id);
      return loadDetail(orgId, await getOrThrow(orgId, id));
    },

    async delete(orgId: string, id: string): Promise<void> {
      const deleted = await inspectionsRepo.delete(orgId, id);
      if (!deleted) throw new NotFoundError(`inspection ${id} not found`);
    },
  };
}

export type InspectionsService = ReturnType<typeof createInspectionsService>;
