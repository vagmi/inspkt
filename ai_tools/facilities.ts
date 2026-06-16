import _d from "./declarations";
// Force inclusion of declarations in compiled output (decorators rely on it).
const _t = _d;
import { apiFetch, clean, navigate } from "./lib/api";

interface ListFacilitiesArgs {
  /** Filter to a single client by id. Omit to list all facilities. */
  clientId: string | undefined;
}

interface CreateFacilityArgs {
  /** Id of the owning client. Required. */
  clientId: string;
  /** Facility / site name. Required. */
  name: string;
  /** Description of the site. */
  description: string | undefined;
  /** Category label (e.g. "warehouse", "plant"). */
  category: string | undefined;
  /** Human-readable address or location label. */
  locationLabel: string | undefined;
}

class FacilityTools {
  /** List facilities (sites), optionally filtered to one client. */
  @tool
  static async list_facilities({ clientId }: ListFacilitiesArgs) {
    const q = clientId
      ? `?clientId=${encodeURIComponent(clientId)}`
      : "";
    return await apiFetch("GET", `/api/facilities${q}`);
  }

  /** Create a facility (a physical site) under a client. */
  @tool
  static async create_facility({
    clientId,
    name,
    description,
    category,
    locationLabel,
  }: CreateFacilityArgs) {
    const { facility } = await apiFetch(
      "POST",
      "/api/facilities",
      clean({ clientId, name, description, category, locationLabel }),
    );
    await navigate(`/app/clients/${facility.clientId}`);
    return { success: true, facility_id: facility.id, name: facility.name };
  }
}
