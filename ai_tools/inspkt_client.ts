// Single-file inspkt setup-assistant client — all tools concatenated, plain
// TypeScript (no @tool decorators, no declarations, no JSDoc). Types + code.
//
// `meta` is a UraiJS global (a WinterTC V8 runtime: fetch only, no Node APIs).
// Auth and context arrive from the widget embed and the platform:
//   meta.secrets.INSPKT_API_HOST        — inspkt API origin (dashboard secret)
//   meta.vars.metadata._widget_token  — short-lived bearer token (inspktw_…)
//   meta.vars.org_id         — org id (also baked into the token)
//   meta.vars.thread_id   — conversation id (for sendCommand)

// ---- HTTP / host helpers ----------------------------------------------

function apiHost(): string {
  return meta.secrets.INSPKT_API_HOST || "http://localhost:5173";
}

async function sendCommand(payload: unknown): Promise<void> {
  const threadId = meta.vars.thread_id;
  if (!threadId) return;
  try {
    await meta.urai.sendCommand(threadId, payload);
  } catch (e) {
    console.warn("sendCommand failed:", e);
  }
}

async function apiFetch(
  method: string,
  path: string,
  body?: unknown,
): Promise<any> {
  const token = meta.vars.metadata?._widget_token;
  if (!token) {
    throw new Error("missing _widget_token in session metadata");
  }
  const res = await fetch(`${apiHost()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`inspkt API ${res.status} on ${method} ${path}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function navigate(path: string): Promise<void> {
  await sendCommand({ type: "navigate", payload: { path } });
}

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// ---- Clients ----------------------------------------------------------

export interface CreateClientArgs {
  name: string;
  contactName: string | undefined;
  contactEmail: string | undefined;
  contactPhone: string | undefined;
  notes: string | undefined;
}

export async function list_clients() {
  return await apiFetch("GET", "/api/clients");
}

export async function create_client({
  name,
  contactName,
  contactEmail,
  contactPhone,
  notes,
}: CreateClientArgs) {
  const { client } = await apiFetch(
    "POST",
    "/api/clients",
    clean({ name, contactName, contactEmail, contactPhone, notes }),
  );
  await navigate(`/app/clients/${client.id}`);
  return { success: true, client_id: client.id, name: client.name };
}

// ---- Facilities -------------------------------------------------------

export interface ListFacilitiesArgs {
  clientId: string | undefined;
}

export interface CreateFacilityArgs {
  clientId: string;
  name: string;
  description: string | undefined;
  category: string | undefined;
  locationLabel: string | undefined;
}

export async function list_facilities({ clientId }: ListFacilitiesArgs) {
  const q = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
  return await apiFetch("GET", `/api/facilities${q}`);
}

export async function create_facility({
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

// ---- Equipment types --------------------------------------------------

export interface FieldDef {
  key: string;
  label: string;
  type: string;
  required: boolean | undefined;
  options: string[] | undefined;
  helpText: string | undefined;
}

export interface CreateEquipmentTypeArgs {
  name: string;
  description: string | undefined;
  fields: FieldDef[] | undefined;
  formIds: string[] | undefined;
}

export async function list_equipment_types() {
  return await apiFetch("GET", "/api/equipment-types");
}

export async function create_equipment_type({
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

// ---- Equipment --------------------------------------------------------

export interface ListEquipmentArgs {
  facilityId: string | undefined;
  clientId: string | undefined;
}

export interface CreateEquipmentArgs {
  clientId: string;
  typeId: string;
  name: string;
  facilityId: string | undefined;
  identifier: string | undefined;
  metadata: Record<string, unknown> | undefined;
}

export async function list_equipment({
  facilityId,
  clientId,
}: ListEquipmentArgs) {
  const params = new URLSearchParams();
  if (facilityId) params.set("facilityId", facilityId);
  else if (clientId) params.set("clientId", clientId);
  const q = params.toString() ? `?${params.toString()}` : "";
  return await apiFetch("GET", `/api/equipment${q}`);
}

export async function create_equipment({
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

// ---- Forms ------------------------------------------------------------

export interface CheckpointConfig {
  unit: string | undefined;
  okMin: number | undefined;
  okMax: number | undefined;
  warnMin: number | undefined;
  warnMax: number | undefined;
  scaleMax: number | undefined;
  passMin: number | undefined;
}

export interface FormCheckpoint {
  section: string | undefined;
  prompt: string;
  answerType: string;
  severity: string | undefined;
  critical: boolean | undefined;
  photoRequired: boolean | undefined;
  config: CheckpointConfig | undefined;
}

export interface CreateFormArgs {
  name: string;
  description: string | undefined;
  checkpoints: FormCheckpoint[] | undefined;
  typeIds: string[] | undefined;
}

export interface UpdateCheckpointArgs {
  formId: string;
  checkpointId: string;
  prompt: string | undefined;
  severity: string | undefined;
  critical: boolean | undefined;
  photoRequired: boolean | undefined;
  okMin: number | undefined;
  okMax: number | undefined;
  warnMin: number | undefined;
  warnMax: number | undefined;
  unit: string | undefined;
  scaleMax: number | undefined;
  passMin: number | undefined;
}

export interface AttachFormToTypeArgs {
  typeId: string;
  formId: string;
}

export async function list_forms() {
  return await apiFetch("GET", "/api/forms");
}

export async function create_form({
  name,
  description,
  checkpoints,
  typeIds,
}: CreateFormArgs) {
  const { form } = await apiFetch(
    "POST",
    "/api/forms",
    clean({ name, description, checkpoints, typeIds }),
  );
  await navigate(`/app/forms/${form.id}`);
  return {
    success: true,
    form_id: form.id,
    name: form.name,
    checkpoints: form.checkpoints?.length ?? 0,
  };
}

export async function update_checkpoint({
  formId,
  checkpointId,
  prompt,
  severity,
  critical,
  photoRequired,
  okMin,
  okMax,
  warnMin,
  warnMax,
  unit,
  scaleMax,
  passMin,
}: UpdateCheckpointArgs) {
  // Read the current checkpoint so we can merge into its existing config —
  // config is replaced wholesale by the API, so we send a complete one.
  const { form } = await apiFetch("GET", `/api/forms/${formId}`);
  const cp = (form.checkpoints || []).find((c: any) => c.id === checkpointId);
  if (!cp) {
    throw new Error(`checkpoint ${checkpointId} not found on form ${formId}`);
  }

  const patch: Record<string, unknown> = clean({
    prompt,
    severity,
    critical,
    photoRequired,
  });

  if (cp.answerType === "numeric") {
    patch.config = clean({
      unit: unit ?? cp.config?.unit,
      okMin: okMin ?? cp.config?.okMin,
      okMax: okMax ?? cp.config?.okMax,
      warnMin: warnMin ?? cp.config?.warnMin,
      warnMax: warnMax ?? cp.config?.warnMax,
    });
  } else if (cp.answerType === "rating") {
    patch.config = clean({
      scaleMax: scaleMax ?? cp.config?.scaleMax,
      passMin: passMin ?? cp.config?.passMin,
      warnMin: warnMin ?? cp.config?.warnMin,
    });
  }

  const { form: updated } = await apiFetch(
    "PATCH",
    `/api/forms/${formId}/checkpoints/${checkpointId}`,
    patch,
  );
  await navigate(`/app/forms/${formId}`);
  return {
    success: true,
    form_id: formId,
    checkpoint_id: checkpointId,
    form: updated,
  };
}

export async function attach_form_to_type({
  typeId,
  formId,
}: AttachFormToTypeArgs) {
  const { type } = await apiFetch("GET", `/api/equipment-types/${typeId}`);
  const formIds: string[] = Array.isArray(type.formIds) ? type.formIds : [];
  if (formIds.includes(formId)) {
    return { success: true, type_id: typeId, already_linked: true };
  }
  await apiFetch("PATCH", `/api/equipment-types/${typeId}`, {
    formIds: [...formIds, formId],
  });
  return { success: true, type_id: typeId, form_id: formId };
}

// ---- Example: create a form with checkpoints --------------------------
// The example payloads are exported so they can be unit-tested against the
// real API (see tests/ai-tools/inspkt-client.test.ts).

export const WATER_HEATER_TYPE: CreateEquipmentTypeArgs = {
  name: "Water Heater",
  description:
    "Residential water heating systems including tank-style and tankless units.",
  fields: [
    { key: "manufacturer", label: "Manufacturer", type: "text", required: false, options: undefined, helpText: undefined },
    { key: "model", label: "Model Number", type: "text", required: false, options: undefined, helpText: undefined },
    { key: "serial", label: "Serial Number", type: "text", required: false, options: undefined, helpText: undefined },
    {
      key: "fuel_type",
      label: "Fuel Type",
      type: "select",
      required: true,
      options: ["Natural Gas", "Propane", "Electric", "Hybrid/Heat Pump", "Tankless Gas", "Tankless Electric"],
      helpText: undefined,
    },
    { key: "capacity_gallons", label: "Capacity (Gallons)", type: "number", required: false, options: undefined, helpText: undefined },
  ],
  formIds: undefined,
};

/** The Water Heater inspection form, linked to the given equipment type id. */
export function waterHeaterForm(typeId: string): CreateFormArgs {
  return {
    name: "Residential Water Heater Inspection",
    description:
      "Standard safety and performance inspection checklist for residential water heaters.",
    typeIds: [typeId],
    checkpoints: [
      { section: "Visual Assessment", prompt: "Check tank body and surrounding area for any signs of rust, corrosion, or active water leaks.", answerType: "pass_fail", severity: "major", critical: true, photoRequired: true, config: undefined },
      { section: "Plumbing & Valves", prompt: "Inspect Temperature & Pressure (T&P) Relief Valve: confirm it's present, dry (not leaking), and has a properly routed discharge pipe.", answerType: "pass_fail", severity: "critical", critical: true, photoRequired: true, config: undefined },
      { section: "Plumbing & Valves", prompt: "Verify the cold water inlet shut-off valve is fully operational and flex lines show no corrosion or leaking.", answerType: "pass_fail", severity: "major", critical: false, photoRequired: false, config: undefined },
      {
        section: "Performance",
        prompt: "Measure the delivered hot water temperature at the nearest tap.",
        answerType: "numeric",
        severity: "major",
        critical: false,
        photoRequired: false,
        config: { unit: "°F", okMin: 115, okMax: 125, warnMin: 110, warnMax: 135, scaleMax: undefined, passMin: undefined },
      },
      { section: "Energy & Connections", prompt: "For Gas Units: Verify draft hood alignment, proper vent piping slope/clearance, and a steady blue burner flame with no backdrafting.", answerType: "pass_fail", severity: "critical", critical: true, photoRequired: false, config: undefined },
      { section: "Energy & Connections", prompt: "For Electric Units: Confirm wiring integrity, secure junction box cover, and verify no heat damage/scorching is present.", answerType: "pass_fail", severity: "major", critical: true, photoRequired: false, config: undefined },
      { section: "Anode & Expansion Tank", prompt: "Inspect the thermal expansion tank (if present) for proper support, charge, or waterlogging.", answerType: "pass_fail", severity: "major", critical: false, photoRequired: false, config: undefined },
    ],
  };
}

/**
 * Idempotent example: ensure the Water Heater equipment type exists, then
 * create its inspection form (with checkpoints) linked to it. Re-running
 * matches the existing type/form by name instead of duplicating. Relies on
 * the `meta` global, so call it from a UraiJS script body.
 */
export async function example_setup_water_heater() {
  const out: Record<string, unknown> = {};

  const typesPayload = await list_equipment_types();
  const types = Array.isArray(typesPayload)
    ? typesPayload
    : (typesPayload?.types ?? []);
  let type = types.find((t: any) => t.name === WATER_HEATER_TYPE.name);
  if (!type) {
    const created = await create_equipment_type(WATER_HEATER_TYPE);
    type = { id: created.type_id, name: created.name };
    out.createdType = created;
  } else {
    out.matchedType = { id: type.id, name: type.name };
  }

  const formArgs = waterHeaterForm(type.id);
  const formsPayload = await list_forms();
  const forms = Array.isArray(formsPayload)
    ? formsPayload
    : (formsPayload?.forms ?? []);
  const existing = forms.find((f: any) => f.name === formArgs.name);
  if (!existing) {
    out.createdForm = await create_form(formArgs);
  } else {
    out.matchedForm = { id: existing.id, name: existing.name };
  }

  return { success: true, ...out };
}
