import { useEffect, useMemo, useState } from "react";
import { Link, redirect, useFetcher } from "react-router";
import { toast } from "sonner";
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
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { apiFetch } from "~/lib/api-client.server";
import { cn } from "~/lib/utils";
import type { EquipmentListRow } from "../../../workers/api/repositories/equipment-repo";
import type {
  AttachedForm,
  EquipmentTypeWithForms,
} from "../../../workers/api/repositories/equipment-types-repo";
import type { InspectionListRow } from "../../../workers/api/repositories/inspections-repo";
import type { Route } from "./+types/inspections-list";

export function meta() {
  return [{ title: "Inspections — inspkt" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [inspectionsRes, equipmentRes, typesRes] = await Promise.all([
    apiFetch<{ inspections: InspectionListRow[] }>(request, "/api/inspections"),
    apiFetch<{ equipment: EquipmentListRow[] }>(request, "/api/equipment"),
    apiFetch<{ types: EquipmentTypeWithForms[] }>(
      request,
      "/api/equipment-types",
    ),
  ]);
  return {
    inspections: inspectionsRes.inspections,
    equipment: equipmentRes.equipment,
    types: typesRes.types,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    await apiFetch(request, `/api/inspections/${form.get("id")}`, {
      method: "DELETE",
    });
    return { ok: true };
  }

  // create a draft against a piece of equipment, then jump into the walker
  const equipmentId = String(form.get("equipmentId") ?? "");
  const formId = String(form.get("formId") ?? "");
  if (!equipmentId || !formId) {
    return { ok: false, error: "Pick both equipment and a form." };
  }
  const lat = Number.parseFloat(String(form.get("capturedLat") ?? ""));
  const lng = Number.parseFloat(String(form.get("capturedLng") ?? ""));
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const res = await apiFetch<{ inspection: { id: string } }>(
    request,
    "/api/inspections",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        equipmentId,
        formId,
        capturedLat: hasCoords ? lat : undefined,
        capturedLng: hasCoords ? lng : undefined,
      }),
    },
  );
  throw redirect(`/app/inspections/${res.inspection.id}`);
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "submitted" ? "default" : "secondary"}>
      {status}
    </Badge>
  );
}

/** "Client / Facility" or "Mobile" for an inspection row's location context. */
function locationContext(row: InspectionListRow): string {
  const parts = [row.clientName, row.facilityName].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "Mobile";
}

function InspectionRow({ row }: { row: InspectionListRow }) {
  const fetcher = useFetcher();
  const deleting = fetcher.state !== "idle";
  return (
    <div
      className={cn(
        "bg-card flex items-center justify-between gap-4 rounded-lg border p-4 transition-opacity",
        deleting && "opacity-40",
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link
            to={`/app/inspections/${row.id}`}
            className="truncate text-lg hover:underline"
          >
            {row.equipmentName ?? "—"}
          </Link>
          <StatusBadge status={row.status} />
        </div>
        <p className="form-label-mono text-muted-foreground/70 mt-1 text-[10px]">
          {locationContext(row)} · {row.formName ?? "—"} ·{" "}
          {dateFormat.format(new Date(row.createdAt * 1000))}
        </p>
      </div>
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="id" value={row.id} />
        <button
          type="submit"
          disabled={deleting}
          className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] transition-colors"
        >
          Delete
        </button>
      </fetcher.Form>
    </div>
  );
}

/** Equipment dropdown label — name plus its client / facility (or "mobile"). */
function equipmentLabel(e: EquipmentListRow): string {
  const where = e.facilityName
    ? `${e.clientName ?? "—"} / ${e.facilityName}`
    : `${e.clientName ?? "—"} · mobile`;
  return `${e.name} — ${where}`;
}

function NewInspectionDialog({
  equipment,
  types,
}: {
  equipment: EquipmentListRow[];
  types: EquipmentTypeWithForms[];
}) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const [equipmentId, setEquipmentId] = useState("");
  const [formId, setFormId] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locating, setLocating] = useState(false);
  const busy = fetcher.state !== "idle";

  // The forms each type offers, and the equipment we can actually inspect — a
  // type may have zero forms, and equipment of such a type can't be inspected.
  const formsByType = useMemo(() => {
    const map = new Map<string, AttachedForm[]>();
    for (const t of types) map.set(t.id, t.forms);
    return map;
  }, [types]);

  const eligible = useMemo(
    () => equipment.filter((e) => (formsByType.get(e.typeId)?.length ?? 0) > 0),
    [equipment, formsByType],
  );

  const selected = eligible.find((e) => e.id === equipmentId);
  const availableForms = selected
    ? (formsByType.get(selected.typeId) ?? [])
    : [];
  const ready = eligible.length > 0;

  // When the equipment changes, auto-select the form if its type has exactly
  // one, otherwise clear the choice.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on equipment change
  useEffect(() => {
    const forms = selected ? (formsByType.get(selected.typeId) ?? []) : [];
    setFormId(forms.length === 1 ? forms[0].id : "");
  }, [equipmentId, formsByType]);

  // Try to grab location as soon as the dialog opens — it's best-effort.
  useEffect(() => {
    if (open && !coords && navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocating(false);
        },
        () => setLocating(false),
      );
    }
  }, [open, coords]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === false) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>New inspection</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start an inspection</DialogTitle>
          <DialogDescription>
            Choose the equipment being inspected and the form to inspect it
            against.
          </DialogDescription>
        </DialogHeader>
        {!ready ? (
          <p className="text-muted-foreground text-sm">
            You need at least one piece of{" "}
            <Link to="/app" className="underline">
              equipment
            </Link>{" "}
            whose{" "}
            <Link to="/app/equipment-types" className="underline">
              type
            </Link>{" "}
            has an inspection form attached. Add a form to the equipment's type
            to inspect it.
          </p>
        ) : (
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="equipmentId" value={equipmentId} />
            <input type="hidden" name="formId" value={formId} />
            {coords && (
              <>
                <input type="hidden" name="capturedLat" value={coords.lat} />
                <input type="hidden" name="capturedLng" value={coords.lng} />
              </>
            )}
            <div>
              <Label>Equipment</Label>
              <Select value={equipmentId} onValueChange={setEquipmentId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Pick equipment" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {equipmentLabel(e)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Form</Label>
              <Select
                value={formId}
                onValueChange={setFormId}
                disabled={!selected}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue
                    placeholder={
                      selected ? "Pick a form" : "Pick equipment first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableForms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="form-label-mono text-muted-foreground/70 text-[10px]">
              {locating
                ? "Capturing location…"
                : coords
                  ? `⌖ ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                  : "Location unavailable — capture will proceed without it."}
            </p>
            <DialogFooter>
              <Button type="submit" disabled={busy || !equipmentId || !formId}>
                {busy ? "Starting…" : "Start inspection"}
              </Button>
            </DialogFooter>
          </fetcher.Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function InspectionsList({ loaderData }: Route.ComponentProps) {
  const { inspections, equipment, types } = loaderData;
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">Field capture</p>
          <h1 className="mt-2 text-3xl">Inspections</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pick equipment and a form, walk the checkpoints, get a verdict.
          </p>
        </div>
        <NewInspectionDialog equipment={equipment} types={types} />
      </div>

      <div className="rule-perforated mt-6" />

      {inspections.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <span className="stamp -rotate-3">No inspections yet</span>
          <h2 className="text-2xl">Run your first inspection.</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Each inspection records answers, photos, and location against one
            piece of equipment — and finalizes into a verdict when you submit.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {inspections.map((row) => (
            <InspectionRow key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
