import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, redirect, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "~/components/ui/button";
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

  const [equipmentRes, facilitiesRes, typesRes] = await Promise.all([
    apiFetch<{ equipment: EquipmentListRow[] }>(request, "/api/equipment"),
    apiFetch<{ facilities: FacilityListRow[] }>(request, "/api/facilities"),
    apiFetch<{ types: EquipmentTypeWithForms[] }>(request, "/api/equipment-types"),
  ]);
  return {
    equipment: equipmentRes.equipment,
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

const equipmentFormSchema = z.object({
  facilityId: z.string().min(1, "Pick a facility"),
  typeId: z.string().min(1, "Pick a type"),
  name: z.string().min(1, "Name is required").max(200),
  identifier: z.string().max(120).optional(),
});
type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;

function toDefaults(e?: EquipmentListRow): EquipmentFormValues {
  return {
    facilityId: e?.facilityId ?? "",
    typeId: e?.typeId ?? "",
    name: e?.name ?? "",
    identifier: e?.identifier ?? "",
  };
}

function EquipmentDialog({
  equipment,
  facilities,
  types,
  trigger,
}: {
  equipment?: EquipmentListRow;
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

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(equipment));
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
      facilityId: values.facilityId,
      typeId: values.typeId,
      name: values.name.trim(),
    };
    if (values.identifier?.trim())
      payloadEquipment.identifier = values.identifier.trim();
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
            An asset at a facility, of a type. Its type decides which form
            inspects it.
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
                    <FormLabel>Facility</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pick a facility" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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
  facilities,
  types,
}: {
  equipment: EquipmentListRow;
  facilities: FacilityListRow[];
  types: EquipmentTypeWithForms[];
}) {
  const fetcher = useFetcher();
  const deleting = fetcher.state !== "idle";
  return (
    <div className="flex items-center justify-end gap-3">
      <EquipmentDialog
        equipment={equipment}
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
  const { equipment, facilities, types } = loaderData;
  const ready = facilities.length > 0 && types.length > 0;

  const columns: ColumnDef<EquipmentListRow>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
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
            The assets you inspect — each at a facility, of a type.
          </p>
        </div>
        <EquipmentDialog
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
            <h2 className="text-2xl">Add a facility and a type first.</h2>
            <p className="text-muted-foreground max-w-sm text-sm">
              Equipment lives at a{" "}
              <Link to="/app" className="underline">
                facility
              </Link>{" "}
              and has a{" "}
              <Link to="/app/equipment-types" className="underline">
                type
              </Link>
              .
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
