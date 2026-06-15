import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, redirect, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import {
  cleanMetadata,
  MetadataFields,
  type MetadataState,
} from "~/components/metadata-fields";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
import { Textarea } from "~/components/ui/textarea";
import { actorFromRole, can, landingPath } from "~/lib/capabilities";
import { ApiError, apiFetch } from "~/lib/api-client.server";
import type { Client } from "../../../workers/api/repositories/clients-repo";
import type { EquipmentListRow } from "../../../workers/api/repositories/equipment-repo";
import type { EquipmentTypeWithForms } from "../../../workers/api/repositories/equipment-types-repo";
import type { FacilityListRow } from "../../../workers/api/repositories/facilities-repo";
import type { Route } from "./+types/client-detail";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.client.name ?? "Client"} — inspkt` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await apiFetch<{ role: string }>(request, "/api/me");
  const actor = actorFromRole(me.role);
  if (!can.setup(actor)) throw redirect(landingPath(actor));

  const cid = params.clientId;
  const [clientRes, facilitiesRes, equipmentRes, typesRes] = await Promise.all([
    apiFetch<{ client: Client }>(request, `/api/clients/${cid}`),
    apiFetch<{ facilities: FacilityListRow[] }>(
      request,
      `/api/facilities?clientId=${cid}`,
    ),
    apiFetch<{ equipment: EquipmentListRow[] }>(
      request,
      `/api/equipment?clientId=${cid}`,
    ),
    apiFetch<{ types: EquipmentTypeWithForms[] }>(
      request,
      "/api/equipment-types",
    ),
  ]);
  return {
    client: clientRes.client,
    facilities: facilitiesRes.facilities,
    equipment: equipmentRes.equipment,
    types: typesRes.types,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const body = (await request.json()) as {
    intent: string;
    id?: string;
    facility?: Record<string, unknown>;
    equipment?: Record<string, unknown>;
  };
  const clientId = params.clientId;

  async function call(
    path: string,
    method: string,
    payload?: unknown,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await apiFetch(request, path, {
        method,
        ...(payload
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
            }
          : {}),
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError && (e.status === 422 || e.status === 400)) {
        return { ok: false, error: e.body };
      }
      throw e;
    }
  }

  switch (body.intent) {
    case "facility.create":
      return call("/api/facilities", "POST", { ...body.facility, clientId });
    case "facility.update":
      return call(`/api/facilities/${body.id}`, "PATCH", body.facility);
    case "facility.delete":
      return call(`/api/facilities/${body.id}`, "DELETE");
    case "equipment.create":
      return call("/api/equipment", "POST", { ...body.equipment, clientId });
    case "equipment.update":
      return call(`/api/equipment/${body.id}`, "PATCH", body.equipment);
    case "equipment.delete":
      return call(`/api/equipment/${body.id}`, "DELETE");
    default:
      return { ok: false, error: "unknown action" };
  }
}

function errorText(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  try {
    return (JSON.parse(raw) as { error?: string }).error ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Facility dialog (client is fixed by the page) ──────────────────────────

const facilityFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  locationLabel: z.string().max(300).optional(),
});
type FacilityFormValues = z.infer<typeof facilityFormSchema>;

function FacilityDialog({
  facility,
  trigger,
}: {
  facility?: FacilityListRow;
  trigger: React.ReactNode;
}) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    facility?.locationLat != null && facility?.locationLng != null
      ? { lat: facility.locationLat, lng: facility.locationLng }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const form = useForm<FacilityFormValues>({
    resolver: zodResolver(facilityFormSchema),
    defaultValues: {
      name: facility?.name ?? "",
      category: facility?.category ?? "",
      description: facility?.description ?? "",
      locationLabel: facility?.locationLabel ?? "",
    },
  });
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (open) {
      form.reset({
        name: facility?.name ?? "",
        category: facility?.category ?? "",
        description: facility?.description ?? "",
        locationLabel: facility?.locationLabel ?? "",
      });
      setCoords(
        facility?.locationLat != null && facility?.locationLng != null
          ? { lat: facility.locationLat, lng: facility.locationLng }
          : null,
      );
    }
  }, [open, facility, form]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok && open) {
        setOpen(false);
        toast.success(facility ? "Facility updated" : "Facility added");
      } else if (!fetcher.data.ok) {
        toast.error(errorText(fetcher.data.error, "Could not save facility"));
      }
    }
  }, [fetcher.state, fetcher.data, open, facility]);

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
    );
  }

  function onSubmit(v: FacilityFormValues) {
    const facilityPayload: Record<string, unknown> = { name: v.name.trim() };
    if (v.category?.trim()) facilityPayload.category = v.category.trim();
    if (v.description?.trim()) facilityPayload.description = v.description.trim();
    if (v.locationLabel?.trim())
      facilityPayload.locationLabel = v.locationLabel.trim();
    if (coords) {
      facilityPayload.locationLat = coords.lat;
      facilityPayload.locationLng = coords.lng;
    }
    const payload = JSON.parse(
      JSON.stringify({
        intent: facility ? "facility.update" : "facility.create",
        id: facility?.id,
        facility: facilityPayload,
      }),
    );
    fetcher.submit(payload, { method: "post", encType: "application/json" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{facility ? "Edit facility" : "New facility"}</DialogTitle>
          <DialogDescription>
            A site belonging to this client. Equipment can be registered against
            it.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Building A" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input placeholder="Warehouse, office…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="What is this site?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <Label>Location</Label>
              <div className="mt-1.5 flex gap-2">
                <FormField
                  control={form.control}
                  name="locationLabel"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input placeholder="123 Main St, Bay 4" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={locate}
                  disabled={locating}
                >
                  {locating ? "Locating…" : coords ? "⌖ Captured" : "⌖ Locate"}
                </Button>
              </div>
              {coords && (
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy
                  ? "Saving…"
                  : facility
                    ? "Save changes"
                    : "Create facility"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Equipment dialog (client is fixed by the page) ─────────────────────────

const NO_FACILITY = "__none__";

const equipmentFormSchema = z.object({
  facilityId: z.string(),
  typeId: z.string().min(1, "Pick a type"),
  name: z.string().min(1, "Name is required").max(200),
  identifier: z.string().max(120).optional(),
});
type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;

function EquipmentDialog({
  equipment,
  facilities,
  types,
  defaultFacilityId,
  trigger,
}: {
  equipment?: EquipmentListRow;
  facilities: FacilityListRow[];
  types: EquipmentTypeWithForms[];
  defaultFacilityId?: string;
  trigger: React.ReactNode;
}) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const [metadata, setMetadata] = useState<MetadataState>(
    () => equipment?.metadata ?? {},
  );
  const form = useForm<EquipmentFormValues>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: {
      facilityId: equipment?.facilityId ?? defaultFacilityId ?? "",
      typeId: equipment?.typeId ?? "",
      name: equipment?.name ?? "",
      identifier: equipment?.identifier ?? "",
    },
  });
  const busy = fetcher.state !== "idle";
  const selectedType = types.find((t) => t.id === form.watch("typeId"));

  useEffect(() => {
    if (open) {
      form.reset({
        facilityId: equipment?.facilityId ?? defaultFacilityId ?? "",
        typeId: equipment?.typeId ?? "",
        name: equipment?.name ?? "",
        identifier: equipment?.identifier ?? "",
      });
      setMetadata(equipment?.metadata ?? {});
    }
  }, [open, equipment, defaultFacilityId, form]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok && open) {
        setOpen(false);
        toast.success(equipment ? "Equipment updated" : "Equipment added");
      } else if (!fetcher.data.ok) {
        toast.error(errorText(fetcher.data.error, "Could not save equipment"));
      }
    }
  }, [fetcher.state, fetcher.data, open, equipment]);

  function onSubmit(v: EquipmentFormValues) {
    const equipmentPayload: Record<string, unknown> = {
      typeId: v.typeId,
      name: v.name.trim(),
      facilityId: v.facilityId || (equipment ? null : undefined),
      metadata: selectedType ? cleanMetadata(selectedType.fields, metadata) : {},
    };
    if (v.identifier?.trim()) equipmentPayload.identifier = v.identifier.trim();
    const payload = JSON.parse(
      JSON.stringify({
        intent: equipment ? "equipment.update" : "equipment.create",
        id: equipment?.id,
        equipment: equipmentPayload,
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
            An asset of a type. Optionally at one of this client's facilities —
            a mobile asset (van, truck) can have none.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        {facilities.map((f) => (
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

// ── Row helpers ────────────────────────────────────────────────────────────

function DeleteAction({
  intent,
  id,
  confirmLabel,
}: {
  intent: string;
  id: string;
  confirmLabel: string;
}) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.ok) {
      toast.error(errorText(fetcher.data.error, "Could not delete"));
    }
  }, [fetcher.state, fetcher.data]);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (!confirm(`Delete ${confirmLabel}?`)) return;
        fetcher.submit(
          { intent, id },
          { method: "post", encType: "application/json" },
        );
      }}
      className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] disabled:opacity-50"
    >
      {busy ? "…" : "Delete"}
    </button>
  );
}

function EquipmentRow({
  e,
  facilities,
  types,
}: {
  e: EquipmentListRow;
  facilities: FacilityListRow[];
  types: EquipmentTypeWithForms[];
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 truncate">
        {e.name}
        {e.identifier && (
          <span className="text-muted-foreground/70 ml-2 font-mono text-xs">
            {e.identifier}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {e.typeName && <Badge variant="secondary">{e.typeName}</Badge>}
        <EquipmentDialog
          equipment={e}
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
        <DeleteAction intent="equipment.delete" id={e.id} confirmLabel={e.name} />
      </span>
    </li>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ClientDetail({ loaderData }: Route.ComponentProps) {
  const { client, facilities, equipment, types } = loaderData;

  const byFacility = new Map<string, EquipmentListRow[]>();
  const mobile: EquipmentListRow[] = [];
  for (const e of equipment) {
    if (!e.facilityId) {
      mobile.push(e);
      continue;
    }
    const list = byFacility.get(e.facilityId) ?? [];
    list.push(e);
    byFacility.set(e.facilityId, list);
  }

  const contactBits = [
    client.contactName,
    client.contactEmail,
    client.contactPhone,
  ].filter(Boolean);
  const noTypes = types.length === 0;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="form-label-mono text-muted-foreground">
            <Link to="/app" className="hover:text-foreground">
              Clients
            </Link>{" "}
            / {client.name}
          </p>
          <h1 className="mt-2 text-3xl">{client.name}</h1>
          {contactBits.length > 0 && (
            <p className="text-muted-foreground mt-1 text-sm">
              {contactBits.join(" · ")}
            </p>
          )}
          <p className="text-muted-foreground mt-1 text-sm">
            {facilities.length}{" "}
            {facilities.length === 1 ? "facility" : "facilities"} ·{" "}
            {equipment.length} equipment
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FacilityDialog
            trigger={<Button variant="outline">New facility</Button>}
          />
          <EquipmentDialog
            facilities={facilities}
            types={types}
            trigger={
              <Button disabled={noTypes} title={noTypes ? "Add a type first" : ""}>
                New equipment
              </Button>
            }
          />
        </div>
      </div>

      {client.notes && (
        <p className="text-muted-foreground bg-muted/40 mt-4 rounded-md border p-3 text-sm">
          {client.notes}
        </p>
      )}
      {noTypes && (
        <p className="text-muted-foreground mt-4 text-sm">
          Add an{" "}
          <Link to="/app/equipment-types" className="underline">
            equipment type
          </Link>{" "}
          before registering equipment.
        </p>
      )}

      <div className="rule-perforated mt-6" />

      {facilities.length === 0 && mobile.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <span className="stamp -rotate-3">Nothing yet</span>
          <h2 className="text-2xl">No facilities or equipment.</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Use “New facility” or “New equipment” above to set up {client.name}.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {facilities.map((f) => {
            const eq = byFacility.get(f.id) ?? [];
            const location =
              f.locationLabel ??
              (f.locationLat != null
                ? `${f.locationLat.toFixed(3)}, ${f.locationLng?.toFixed(3)}`
                : null);
            return (
              <div key={f.id} className="bg-card rounded-lg border p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg">{f.name}</h3>
                    {f.category && (
                      <p className="form-label-mono text-muted-foreground/70 text-[10px] uppercase">
                        {f.category}
                      </p>
                    )}
                    {location && (
                      <p className="form-label-mono text-muted-foreground/70 text-[10px]">
                        ⌖ {location}
                      </p>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-3">
                    <FacilityDialog
                      facility={f}
                      trigger={
                        <button
                          type="button"
                          className="form-label-mono text-muted-foreground/70 hover:text-foreground text-[10px]"
                        >
                          Edit
                        </button>
                      }
                    />
                    <DeleteAction
                      intent="facility.delete"
                      id={f.id}
                      confirmLabel={f.name}
                    />
                  </span>
                </div>
                <div className="mt-4">
                  <p className="form-label-mono text-muted-foreground mb-2 text-[10px]">
                    {eq.length} equipment
                  </p>
                  {eq.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No equipment here yet.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-md border">
                      {eq.map((e) => (
                        <EquipmentRow
                          key={e.id}
                          e={e}
                          facilities={facilities}
                          types={types}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}

          {mobile.length > 0 && (
            <div className="bg-card rounded-lg border border-dashed p-5">
              <h3 className="text-lg">Mobile equipment</h3>
              <p className="form-label-mono text-muted-foreground/70 text-[10px]">
                Not tied to a facility
              </p>
              <ul className="mt-4 divide-y rounded-md border">
                {mobile.map((e) => (
                  <EquipmentRow
                    key={e.id}
                    e={e}
                    facilities={facilities}
                    types={types}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
