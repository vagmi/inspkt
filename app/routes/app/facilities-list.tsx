import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { redirect, useFetcher } from "react-router";
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
import { Textarea } from "~/components/ui/textarea";
import { actorFromRole, can, landingPath } from "~/lib/capabilities";
import { apiFetch } from "~/lib/api-client.server";
import type { Client } from "../../../workers/api/repositories/clients-repo";
import type { FacilityListRow } from "../../../workers/api/repositories/facilities-repo";
import type { Route } from "./+types/facilities-list";

export function meta() {
  return [{ title: "Facilities — inspkt" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Setup data — inspectors don't manage facilities; bounce them to their work.
  const me = await apiFetch<{ role: string }>(request, "/api/me");
  const actor = actorFromRole(me.role);
  if (!can.setup(actor)) throw redirect(landingPath(actor));

  const [facilitiesRes, clientsRes] = await Promise.all([
    apiFetch<{ facilities: FacilityListRow[] }>(request, "/api/facilities"),
    apiFetch<{ clients: Client[] }>(request, "/api/clients"),
  ]);
  return { facilities: facilitiesRes.facilities, clients: clientsRes.clients };
}

export async function action({ request }: Route.ActionArgs) {
  const body = (await request.json()) as {
    intent: "create" | "update" | "delete";
    id?: string;
    facility?: Record<string, unknown>;
  };

  if (body.intent === "delete") {
    await apiFetch(request, `/api/facilities/${body.id}`, { method: "DELETE" });
    return { ok: true };
  }

  const path =
    body.intent === "update"
      ? `/api/facilities/${body.id}`
      : "/api/facilities";
  const method = body.intent === "update" ? "PATCH" : "POST";
  await apiFetch(request, path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body.facility ?? {}),
  });
  return { ok: true };
}

const facilityFormSchema = z.object({
  clientId: z.string().min(1, "Pick a client"),
  name: z.string().min(1, "Name is required").max(200),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  locationLabel: z.string().max(300).optional(),
});
type FacilityFormValues = z.infer<typeof facilityFormSchema>;

function toDefaults(f?: FacilityListRow): FacilityFormValues {
  return {
    clientId: f?.clientId ?? "",
    name: f?.name ?? "",
    category: f?.category ?? "",
    description: f?.description ?? "",
    locationLabel: f?.locationLabel ?? "",
  };
}

function FacilityDialog({
  facility,
  clients,
  trigger,
}: {
  facility?: FacilityListRow;
  clients: Client[];
  trigger: React.ReactNode;
}) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  // Location is captured separately from the text form (browser geolocation).
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    facility?.locationLat != null && facility?.locationLng != null
      ? { lat: facility.locationLat, lng: facility.locationLng }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const form = useForm<FacilityFormValues>({
    resolver: zodResolver(facilityFormSchema),
    defaultValues: toDefaults(facility),
  });
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (open) {
      form.reset(toDefaults(facility));
      setCoords(
        facility?.locationLat != null && facility?.locationLng != null
          ? { lat: facility.locationLat, lng: facility.locationLng }
          : null,
      );
    }
  }, [open, facility, form]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && open) {
      setOpen(false);
      toast.success(facility ? "Facility updated" : "Facility created");
    }
  }, [fetcher.state, fetcher.data, open, facility]);

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

  function onSubmit(values: FacilityFormValues) {
    const facilityPayload: Record<string, unknown> = {
      clientId: values.clientId,
      name: values.name.trim(),
    };
    if (values.category?.trim()) facilityPayload.category = values.category.trim();
    if (values.description?.trim())
      facilityPayload.description = values.description.trim();
    if (values.locationLabel?.trim())
      facilityPayload.locationLabel = values.locationLabel.trim();
    if (coords) {
      facilityPayload.locationLat = coords.lat;
      facilityPayload.locationLng = coords.lng;
    }
    const payload = JSON.parse(
      JSON.stringify({
        intent: facility ? "update" : "create",
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
          <DialogTitle>
            {facility ? "Edit facility" : "New facility"}
          </DialogTitle>
          <DialogDescription>
            A facility is a site belonging to a client. Equipment is registered
            against a facility.
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
                    onValueChange={field.onChange}
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
                  onClick={captureLocation}
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

function RowActions({
  facility,
  clients,
}: {
  facility: FacilityListRow;
  clients: Client[];
}) {
  const fetcher = useFetcher();
  const deleting = fetcher.state !== "idle";
  return (
    <div className="flex items-center justify-end gap-3">
      <FacilityDialog
        facility={facility}
        clients={clients}
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
          if (!confirm(`Delete ${facility.name}?`)) return;
          fetcher.submit(
            { intent: "delete", id: facility.id },
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

export default function FacilitiesList({ loaderData }: Route.ComponentProps) {
  const { facilities, clients } = loaderData;

  const columns: ColumnDef<FacilityListRow>[] = [
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
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => row.original.category ?? "—",
    },
    {
      id: "location",
      header: "Location",
      cell: ({ row }) => {
        const f = row.original;
        if (f.locationLabel) return f.locationLabel;
        if (f.locationLat != null)
          return (
            <span className="font-mono text-xs">
              {f.locationLat.toFixed(3)}, {f.locationLng?.toFixed(3)}
            </span>
          );
        return "—";
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <RowActions facility={row.original} clients={clients} />,
    },
  ];

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">Setup</p>
          <h1 className="mt-2 text-3xl">Facilities</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The sites you inspect. Each belongs to a client.
          </p>
        </div>
        <FacilityDialog
          clients={clients}
          trigger={<Button disabled={clients.length === 0}>New facility</Button>}
        />
      </div>

      <div className="rule-perforated mt-6" />

      <div className="mt-8">
        {clients.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="stamp -rotate-3">No clients yet</span>
            <h2 className="text-2xl">Add a client first.</h2>
            <p className="text-muted-foreground max-w-sm text-sm">
              Facilities belong to a client — create one on the{" "}
              <a href="/app/clients" className="underline">
                Clients
              </a>{" "}
              page, then register its facilities here.
            </p>
          </div>
        ) : facilities.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="stamp -rotate-3">No facilities yet</span>
            <h2 className="text-2xl">Register your first facility.</h2>
            <p className="text-muted-foreground max-w-sm text-sm">
              Add the sites you inspect, then register their equipment.
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={facilities}
            filterColumn="name"
            filterPlaceholder="Search facilities…"
          />
        )}
      </div>
    </div>
  );
}
