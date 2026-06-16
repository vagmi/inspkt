import _d from "./declarations";
// Force inclusion of declarations in compiled output (decorators rely on it).
const _t = _d;
import { apiFetch, clean, navigate } from "./lib/api";

interface FieldDef {
  /** snake_case key (a-z, 0-9, _). Required. */
  key: string;
  /** Human label. Required. */
  label: string;
  /** Field type: text | number | date | boolean | select | multiselect | file. */
  type: string;
  /** Whether the field is required. */
  required: boolean | undefined;
  /** Allowed options (required for select / multiselect). */
  options: string[] | undefined;
  /** Help text shown under the field. */
  helpText: string | undefined;
}

interface CreateEquipmentTypeArgs {
  /** Equipment type name. Required. */
  name: string;
  /** Description of this class of equipment. */
  description: string | undefined;
  /** Custom field definitions describing this type's metadata schema. */
  fields: FieldDef[] | undefined;
  /** Ids of inspection forms used for this type. */
  formIds: string[] | undefined;
}

class EquipmentTypeTools {
  /**
   * List equipment types. A type defines a class of equipment, its custom
   * fields, and the forms used to inspect it.
   */
  @tool
  static async list_equipment_types() {
    return await apiFetch("GET", "/api/equipment-types");
  }

  /**
   * Create an equipment type with an optional custom-field schema and links to
   * inspection forms.
   */
  @tool
  static async create_equipment_type({
    name,
    description,
    fields,
    formIds,
  }: CreateEquipmentTypeArgs) {
    const { type } = await apiFetch(
      "POST",
      "/api/equipment-types",
      clean({ name, description, fields, formIds }),
    );
    await navigate(`/app/equipment-types/${type.id}`);
    return { success: true, type_id: type.id, name: type.name };
  }
}
