import type { Client, ClientsRepo } from "../repositories/clients-repo";
import type { Equipment, EquipmentRepo } from "../repositories/equipment-repo";
import type { EquipmentTypesRepo } from "../repositories/equipment-types-repo";
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
  equipmentRepo: EquipmentRepo;
  equipmentTypesRepo: EquipmentTypesRepo;
  facilitiesRepo: FacilitiesRepo;
  clientsRepo: ClientsRepo;
  formsRepo: FormsRepo;
}

/** A draft/submitted inspection joined with the form being walked, the
 * equipment under inspection (plus its facility/client for context), and a
 * computed location-mismatch distance. `facility` is null for mobile equipment. */
export interface InspectionDetail extends InspectionWithObservations {
  form: FormWithCheckpoints;
  equipment: Equipment;
  facility: Facility | null;
  client: Client | null;
  /** Metres between captured and registered location, or null if either is
   * absent. `locationMismatch` is true past the threshold. The registered
   * location is the equipment's own, falling back to its facility's. */
  locationDistanceMeters: number | null;
  locationMismatch: boolean;
}

export function createInspectionsService({
  inspectionsRepo,
  equipmentRepo,
  equipmentTypesRepo,
  facilitiesRepo,
  clientsRepo,
  formsRepo,
}: InspectionsServiceDeps) {
  async function loadDetail(
    orgId: string,
    inspection: InspectionWithObservations,
  ): Promise<InspectionDetail> {
    if (!inspection.equipmentId)
      throw new NotFoundError(`inspection ${inspection.id} has no equipment`);
    const [form, equipment] = await Promise.all([
      formsRepo.getById(orgId, inspection.formId),
      equipmentRepo.getById(orgId, inspection.equipmentId),
    ]);
    if (!form) throw new NotFoundError(`form ${inspection.formId} not found`);
    if (!equipment)
      throw new NotFoundError(`equipment ${inspection.equipmentId} not found`);

    // Facility (snapshot on the inspection) and client (owner of the equipment)
    // are context; either may be absent for mobile equipment.
    const [facility, client] = await Promise.all([
      inspection.facilityId
        ? facilitiesRepo.getById(orgId, inspection.facilityId)
        : Promise.resolve(null),
      equipment.clientId
        ? clientsRepo.getById(orgId, equipment.clientId)
        : Promise.resolve(null),
    ]);

    // Compare the capture against the equipment's own location, falling back to
    // its facility's when the equipment has none registered.
    const registeredLat = equipment.locationLat ?? facility?.locationLat ?? null;
    const registeredLng = equipment.locationLng ?? facility?.locationLng ?? null;
    let distance: number | null = null;
    if (
      inspection.capturedLat != null &&
      inspection.capturedLng != null &&
      registeredLat != null &&
      registeredLng != null
    ) {
      distance = haversineMeters(
        inspection.capturedLat,
        inspection.capturedLng,
        registeredLat,
        registeredLng,
      );
    }
    return {
      ...inspection,
      form,
      equipment,
      facility,
      client,
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

    /** Start a draft against a piece of equipment. The chosen form must be one
     * of the equipment's type's forms; the inspection's facility is snapshotted
     * from the equipment (null for mobile). */
    async create(
      orgId: string,
      inspectorUserId: string,
      input: Pick<InspectionCreate, "equipmentId" | "formId"> & {
        capturedLat?: number | null;
        capturedLng?: number | null;
      },
    ): Promise<InspectionDetail> {
      const equipment = await equipmentRepo.getById(orgId, input.equipmentId);
      if (!equipment)
        throw new NotFoundError(`equipment ${input.equipmentId} not found`);

      const type = await equipmentTypesRepo.getById(orgId, equipment.typeId);
      if (!type)
        throw new NotFoundError(`equipment type ${equipment.typeId} not found`);

      // The form must be one of this equipment's type's rubrics (type↔forms is
      // many-to-many; the inspector picks one).
      if (!type.forms.some((f) => f.id === input.formId)) {
        throw new ValidationError(
          `form ${input.formId} is not an inspection form for ${type.name}`,
        );
      }

      const created = await inspectionsRepo.create({
        orgId,
        equipmentId: input.equipmentId,
        facilityId: equipment.facilityId,
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
