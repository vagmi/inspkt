import { useEffect, useState } from "react";
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
import type { Form } from "../../../workers/api/repositories/forms-repo";
import type { FacilityListRow } from "../../../workers/api/repositories/facilities-repo";
import type { InspectionListRow } from "../../../workers/api/repositories/inspections-repo";
import type { Route } from "./+types/inspections-list";

export function meta() {
  return [{ title: "Inspections — inspkt" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [inspectionsRes, formsRes, facilitiesRes] = await Promise.all([
    apiFetch<{ inspections: InspectionListRow[] }>(request, "/api/inspections"),
    apiFetch<{ forms: Form[] }>(request, "/api/forms"),
    apiFetch<{ facilities: FacilityListRow[] }>(request, "/api/facilities"),
  ]);
  return {
    inspections: inspectionsRes.inspections,
    forms: formsRes.forms,
    facilities: facilitiesRes.facilities,
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

  // create a draft, then jump into the capture walker
  const facilityId = String(form.get("facilityId") ?? "");
  const formId = String(form.get("formId") ?? "");
  if (!facilityId || !formId) {
    return { ok: false, error: "Pick both a form and a facility." };
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
        facilityId,
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
            {row.facilityName ?? "—"}
          </Link>
          <StatusBadge status={row.status} />
        </div>
        <p className="form-label-mono text-muted-foreground/70 mt-1 text-[10px]">
          {row.formName ?? "—"} ·{" "}
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

function NewInspectionDialog({
  forms,
  facilities,
}: {
  forms: Form[];
  facilities: FacilityListRow[];
}) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const [formId, setFormId] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locating, setLocating] = useState(false);
  const busy = fetcher.state !== "idle";
  const ready = forms.length > 0 && facilities.length > 0;

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
            Choose the form to inspect against and the facility being inspected.
          </DialogDescription>
        </DialogHeader>
        {!ready ? (
          <p className="text-muted-foreground text-sm">
            You need at least one{" "}
            <Link to="/app/forms" className="underline">
              form
            </Link>{" "}
            and one{" "}
            <Link to="/app" className="underline">
              facility
            </Link>{" "}
            first.
          </p>
        ) : (
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="formId" value={formId} />
            <input type="hidden" name="facilityId" value={facilityId} />
            {coords && (
              <>
                <input type="hidden" name="capturedLat" value={coords.lat} />
                <input type="hidden" name="capturedLng" value={coords.lng} />
              </>
            )}
            <div>
              <Label>Form</Label>
              <Select value={formId} onValueChange={setFormId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Pick a form" />
                </SelectTrigger>
                <SelectContent>
                  {forms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Facility</Label>
              <Select value={facilityId} onValueChange={setFacilityId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Pick a facility" />
                </SelectTrigger>
                <SelectContent>
                  {facilities.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                      {f.clientName ? ` · ${f.clientName}` : ""}
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
              <Button type="submit" disabled={busy || !formId || !facilityId}>
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
  const { inspections, forms, facilities } = loaderData;
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">Field capture</p>
          <h1 className="mt-2 text-3xl">Inspections</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Pick a form and an item, walk the checkpoints, get a verdict.
          </p>
        </div>
        <NewInspectionDialog forms={forms} facilities={facilities} />
      </div>

      <div className="rule-perforated mt-6" />

      {inspections.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <span className="stamp -rotate-3">No inspections yet</span>
          <h2 className="text-2xl">Run your first inspection.</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Each inspection records answers, photos, and location against one
            item — and finalizes into a verdict when you submit.
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
