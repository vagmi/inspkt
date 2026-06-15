import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, redirect, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { DataTable } from "~/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { actorFromRole, can, landingPath } from "~/lib/capabilities";
import { apiFetch } from "~/lib/api-client.server";
import { cn } from "~/lib/utils";
import type { FieldDef } from "../../../workers/api/db/schema/equipment";
import type { Client } from "../../../workers/api/repositories/clients-repo";
import type { EquipmentListRow } from "../../../workers/api/repositories/equipment-repo";
import type { EquipmentTypeWithForms } from "../../../workers/api/repositories/equipment-types-repo";
import type { FacilityListRow } from "../../../workers/api/repositories/facilities-repo";
import type { Route } from "./+types/equipment-list";

export function meta() {
  return [{ title: "Equipment — inspkt" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await apiFetch<{ role: string }>(request, "/api/me");
  const actor = actorFromRole(me.role);
  if (!can.setup(actor)) throw redirect(landingPath(actor));

  const [equipmentRes, clientsRes, facilitiesRes, typesRes] = await Promise.all(
    [
      apiFetch<{ equipment: EquipmentListRow[] }>(request, "/api/equipment"),
      apiFetch<{ clients: Client[] }>(request, "/api/clients"),
      apiFetch<{ facilities: FacilityListRow[] }>(request, "/api/facilities"),
      apiFetch<{ types: EquipmentTypeWithForms[] }>(
        request,
        "/api/equipment-types",
      ),
    ],
  );
  return {
    equipment: equipmentRes.equipment,
    clients: clientsRes.clients,
    facilities: facilitiesRes.facilities,
    types: typesRes.types,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const body = (await request.json()) as {
    intent: "create" | "update" | "delete";
    id?: string;
    equipment?: Record<string, unknown>;
  };

  if (body.intent === "delete") {
    await apiFetch(request, `/api/equipment/${body.id}`, { method: "DELETE" });
    return { ok: true };
  }

  const path =
    body.intent === "update" ? `/api/equipment/${body.id}` : "/api/equipment";
  await apiFetch(request, path, {
    method: body.intent === "update" ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body.equipment ?? {}),
  });
  return { ok: true };
}

// Radix Select can't hold an empty value, so "no facility" uses a sentinel.
const NO_FACILITY = "__none__";

const equipmentFormSchema = z.object({
  clientId: z.string().min(1, "Pick a client"),
  facilityId: z.string(), // optional — "" means no facility (mobile asset)
  typeId: z.string().min(1, "Pick a type"),
  name: z.string().min(1, "Name is required").max(200),
  identifier: z.string().max(120).optional(),
});
type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;

function toDefaults(e?: EquipmentListRow): EquipmentFormValues {
  return {
    clientId: e?.clientId ?? "",
    facilityId: e?.facilityId ?? "",
    typeId: e?.typeId ?? "",
    name: e?.name ?? "",
    identifier: e?.identifier ?? "",
  };
}

type MetadataState = Record<string, unknown>;

/** Keep only the present values for the given fields (drop blanks/empties). */
function cleanMetadata(fields: FieldDef[], md: MetadataState): MetadataState {
  const out: MetadataState = {};
  for (const f of fields) {
    const v = md[f.key];
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[f.key] = v;
  }
  return out;
}

/** Renders one input per custom field of the selected equipment type. */
function MetadataFields({
  fields,
  value,
  onChange,
}: {
  fields: FieldDef[];
  value: MetadataState;
  onChange: (next: MetadataState) => void;
}) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const set = (key: string, v: unknown) => onChange({ ...value, [key]: v });

  async function uploadFile(key: string, file: File) {
    setUploadingKey(key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      if (!res.ok) {
        toast.error("Upload failed");
        return;
      }
      const { key: objectKey } = (await res.json()) as { key: string };
      set(key, { key: objectKey, name: file.name });
    } finally {
      setUploadingKey(null);
    }
  }

  if (fields.length === 0) return null;

  return (
    <div className="space-y-4 rounded-md border p-4">
      <p className="form-label-mono text-muted-foreground text-[10px] uppercase">
        Details
      </p>
      {fields.map((f) => {
        const v = value[f.key];
        return (
          <div key={f.key}>
            <Label>
              {f.label}
              {f.required && <span className="text-stamp"> *</span>}
            </Label>
            {f.helpText && (
              <p className="text-muted-foreground text-xs">{f.helpText}</p>
            )}
            <div className="mt-1.5">
              {f.type === "text" && (
                <Input
                  value={(v as string) ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
              {f.type === "number" && (
                <Input
                  type="number"
                  step="any"
                  value={v === undefined || v === null ? "" : String(v)}
                  onChange={(e) =>
                    set(f.key, e.target.value === "" ? "" : Number(e.target.value))
                  }
                />
              )}
              {f.type === "date" && (
                <Input
                  type="date"
                  value={(v as string) ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
              {f.type === "boolean" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={v === true}
                    onCheckedChange={(c) => set(f.key, c === true)}
                  />
                  Yes
                </label>
              )}
              {f.type === "select" && (
                <Select
                  value={(v as string) ?? ""}
                  onValueChange={(next) => set(f.key, next)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {f.type === "multiselect" && (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {(f.options ?? []).map((opt) => {
                    const arr = Array.isArray(v) ? (v as string[]) : [];
                    return (
                      <label
                        key={opt}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={arr.includes(opt)}
                          onCheckedChange={(c) =>
                            set(
                              f.key,
                              c === true
                                ? [...arr, opt]
                                : arr.filter((x) => x !== opt),
                            )
                          }
                        />
                        {opt}
                      </label>
                    );
                  })}
                </div>
              )}
              {f.type === "file" && (
                <div className="flex flex-wrap items-center gap-3">
                  <Label
                    htmlFor={`md-file-${f.key}`}
                    className={cn(
                      "border-input hover:bg-accent inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm",
                      uploadingKey === f.key && "pointer-events-none opacity-50",
                    )}
                  >
                    {uploadingKey === f.key
                      ? "Uploading…"
                      : v
                        ? "Replace"
                        : "+ Upload"}
                  </Label>
                  <input
                    id={`md-file-${f.key}`}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadFile(f.key, file);
                      e.target.value = "";
                    }}
                  />
                  {v != null && typeof v === "object" && (
                    <span className="flex items-center gap-2 text-sm">
                      <a
                        href={`/api/uploads/${(v as { key: string }).key}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {(v as { name?: string }).name ?? "file"}
                      </a>
                      <button
                        type="button"
                        onClick={() => set(f.key, undefined)}
                        className="text-muted-foreground/60 hover:text-destructive text-xs"
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EquipmentDialog({
  equipment,
  clients,
  facilities,
  types,
  trigger,
}: {
  equipment?: EquipmentListRow;
  clients: Client[];
  facilities: FacilityListRow[];
  types: EquipmentTypeWithForms[];
  trigger: React.ReactNode;
}) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    equipment?.locationLat != null && equipment?.locationLng != null
      ? { lat: equipment.locationLat, lng: equipment.locationLng }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const form = useForm<EquipmentFormValues>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: toDefaults(equipment),
  });
  const busy = fetcher.state !== "idle";
  const [metadata, setMetadata] = useState<MetadataState>(
    () => equipment?.metadata ?? {},
  );

  // The facility list is scoped to the chosen client.
  const selectedClientId = form.watch("clientId");
  const clientFacilities = facilities.filter(
    (f) => f.clientId === selectedClientId,
  );
  // The selected type drives which custom fields are shown.
  const selectedTypeId = form.watch("typeId");
  const selectedType = types.find((t) => t.id === selectedTypeId);

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(equipment));
      setMetadata(equipment?.metadata ?? {});
      setCoords(
        equipment?.locationLat != null && equipment?.locationLng != null
          ? { lat: equipment.locationLat, lng: equipment.locationLng }
          : null,
      );
    }
  }, [open, equipment, form]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && open) {
      setOpen(false);
      toast.success(equipment ? "Equipment updated" : "Equipment added");
    }
  }, [fetcher.state, fetcher.data, open, equipment]);

  function captureLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not available");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        toast.error("Couldn't get your location");
        setLocating(false);
      },
    );
  }

  function onSubmit(values: EquipmentFormValues) {
    const payloadEquipment: Record<string, unknown> = {
      clientId: values.clientId,
      typeId: values.typeId,
      name: values.name.trim(),
      // null clears the facility on update; create just omits it.
      facilityId: values.facilityId || (equipment ? null : undefined),
    };
    if (values.identifier?.trim())
      payloadEquipment.identifier = values.identifier.trim();
    // Send only the metadata that belongs to the selected type's fields.
    payloadEquipment.metadata = selectedType
      ? cleanMetadata(selectedType.fields, metadata)
      : {};
    if (coords) {
      payloadEquipment.locationLat = coords.lat;
      payloadEquipment.locationLng = coords.lng;
    }
    const payload = JSON.parse(
      JSON.stringify({
        intent: equipment ? "update" : "create",
        id: equipment?.id,
        equipment: payloadEquipment,
      }),
    );
    fetcher.submit(payload, { method: "post", encType: "application/json" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {equipment ? "Edit equipment" : "New equipment"}
          </DialogTitle>
          <DialogDescription>
            An asset owned by a client. Usually at one of that client's
            facilities — a mobile asset (van, service truck) can have none. Its
            type decides which form inspects it.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      // The current facility may belong to another client.
                      form.setValue("facilityId", "");
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a client" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="facilityId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Facility (optional)</FormLabel>
                    <Select
                      value={field.value || NO_FACILITY}
                      onValueChange={(v) =>
                        field.onChange(v === NO_FACILITY ? "" : v)
                      }
                      disabled={!selectedClientId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NO_FACILITY}>
                          No facility (mobile)
                        </SelectItem>
                        {clientFacilities.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="typeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {types.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Unit A-1" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset tag / serial</FormLabel>
                    <FormControl>
                      <Input placeholder="SN-12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {selectedType && selectedType.fields.length > 0 && (
              <MetadataFields
                fields={selectedType.fields}
                value={metadata}
                onChange={setMetadata}
              />
            )}
            <div>
              <Label>Location (optional)</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={captureLocation}
                  disabled={locating}
                >
                  {locating ? "Locating…" : coords ? "⌖ Captured" : "⌖ Locate"}
                </Button>
                {coords && (
                  <span className="text-muted-foreground font-mono text-xs">
                    {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                  </span>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : equipment
                    ? "Save changes"
                    : "Add equipment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({
  equipment,
  clients,
  facilities,
  types,
}: {
  equipment: EquipmentListRow;
  clients: Client[];
  facilities: FacilityListRow[];
  types: EquipmentTypeWithForms[];
}) {
  const fetcher = useFetcher();
  const deleting = fetcher.state !== "idle";
  return (
    <div className="flex items-center justify-end gap-3">
      <EquipmentDialog
        equipment={equipment}
        clients={clients}
        facilities={facilities}
        types={types}
        trigger={
          <button
            type="button"
            className="form-label-mono text-muted-foreground/70 hover:text-foreground text-[10px]"
          >
            Edit
          </button>
        }
      />
      <button
        type="button"
        disabled={deleting}
        onClick={() => {
          if (!confirm(`Delete ${equipment.name}?`)) return;
          fetcher.submit(
            { intent: "delete", id: equipment.id },
            { method: "post", encType: "application/json" },
          );
        }}
        className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}

export default function EquipmentList({ loaderData }: Route.ComponentProps) {
  const { equipment, clients, facilities, types } = loaderData;
  // Equipment needs a client + type; a facility is optional (mobile assets).
  const ready = clients.length > 0 && types.length > 0;

  const columns: ColumnDef<EquipmentListRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "clientName",
      header: "Client",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.clientName ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "facilityName",
      header: "Facility",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.facilityName ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "typeName",
      header: "Type",
      cell: ({ row }) => row.original.typeName ?? "—",
    },
    {
      accessorKey: "identifier",
      header: "Asset tag",
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.identifier ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <RowActions
          equipment={row.original}
          clients={clients}
          facilities={facilities}
          types={types}
        />
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">Setup</p>
          <h1 className="mt-2 text-3xl">Equipment</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The assets you inspect — each owned by a client, optionally at a
            facility, of a type.
          </p>
        </div>
        <EquipmentDialog
          clients={clients}
          facilities={facilities}
          types={types}
          trigger={<Button disabled={!ready}>New equipment</Button>}
        />
      </div>

      <div className="rule-perforated mt-6" />

      <div className="mt-8">
        {!ready ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="stamp -rotate-3">Setup needed</span>
            <h2 className="text-2xl">Add a client and an equipment type.</h2>
            <p className="text-muted-foreground max-w-sm text-sm">
              Equipment is owned by a{" "}
              <Link to="/app/clients" className="underline">
                client
              </Link>{" "}
              and has a{" "}
              <Link to="/app/equipment-types" className="underline">
                type
              </Link>{" "}
              (and optionally sits at a facility).
            </p>
          </div>
        ) : equipment.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="stamp -rotate-3">No equipment yet</span>
            <h2 className="text-2xl">Register your first asset.</h2>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={equipment}
            filterColumn="name"
            filterPlaceholder="Search equipment…"
          />
        )}
      </div>
    </div>
  );
}
