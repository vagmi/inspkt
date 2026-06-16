import _d from "./declarations";
// Force inclusion of declarations in compiled output (decorators rely on it).
const _t = _d;
import { apiFetch, clean, navigate } from "./lib/api";

interface ListEquipmentArgs {
  /** Filter to a facility by id. */
  facilityId: string | undefined;
  /** Filter to a client by id (used only if facilityId is omitted). */
  clientId: string | undefined;
}

interface CreateEquipmentArgs {
  /** Id of the owning client. Required. */
  clientId: string;
  /** Equipment type id — defines the custom fields. Required. */
  typeId: string;
  /** Equipment name. Required. */
  name: string;
  /** Facility id. Omit for mobile equipment with no fixed site. */
  facilityId: string | undefined;
  /** Asset tag / serial number. */
  identifier: string | undefined;
  /** Values for the type's custom fields, keyed by field key. */
  metadata: Record<string, unknown> | undefined;
}

class EquipmentTools {
  /** List equipment, optionally filtered by facility or client. */
  @tool
  static async list_equipment({ facilityId, clientId }: ListEquipmentArgs) {
    const params = new URLSearchParams();
    if (facilityId) params.set("facilityId", facilityId);
    else if (clientId) params.set("clientId", clientId);
    const q = params.toString() ? `?${params.toString()}` : "";
    return await apiFetch("GET", `/api/equipment${q}`);
  }

  /**
   * Register a piece of equipment. metadata is validated against the type's
   * custom fields. Navigates to the owning client on success.
   */
  @tool
  static async create_equipment({
    clientId,
    typeId,
    name,
    facilityId,
    identifier,
    metadata,
  }: CreateEquipmentArgs) {
    const { equipment } = await apiFetch(
      "POST",
      "/api/equipment",
      clean({ clientId, typeId, name, facilityId, identifier, metadata }),
    );
    await navigate(`/app/clients/${equipment.clientId}`);
    return { success: true, equipment_id: equipment.id, name: equipment.name };
  }
}
