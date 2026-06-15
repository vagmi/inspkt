import { useEffect, useMemo, useState } from "react";
import { Link, redirect, useFetcher } from "react-router";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { apiFetch } from "~/lib/api-client.server";
import { cn } from "~/lib/utils";
import type { Checkpoint } from "../../../workers/api/repositories/forms-repo";
import type { Observation } from "../../../workers/api/repositories/inspections-repo";
import type { InspectionDetail } from "../../../workers/api/services/inspections-service";
import type { Route } from "./+types/inspection-capture";

export function meta() {
  return [{ title: "Capture — inspkt" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const res = await apiFetch<{ inspection: InspectionDetail }>(
    request,
    `/api/inspections/${params.inspectionId}`,
  );
  return { inspection: res.inspection };
}

export async function action({ request, params }: Route.ActionArgs) {
  const body = (await request.json()) as {
    intent: "save" | "submit" | "delete";
    observations?: unknown[];
  };
  const base = `/api/inspections/${params.inspectionId}`;

  if (body.intent === "delete") {
    await apiFetch(request, base, { method: "DELETE" });
    throw redirect("/app/inspections");
  }

  const path = body.intent === "submit" ? `${base}/submit` : base;
  const method = body.intent === "submit" ? "POST" : "PATCH";
  const res = await apiFetch<{ inspection: InspectionDetail }>(request, path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ observations: body.observations ?? [] }),
  });
  return { ok: true as const, inspection: res.inspection };
}

interface Photo {
  key: string;
  url: string;
}

/** Per-checkpoint editing state, all strings/locals until serialized. */
interface AnswerState {
  pass: boolean | null;
  numeric: string;
  rating: number | null;
  note: string;
  photos: Photo[];
}

/** Same-origin authenticated read route. The browser sends the Clerk cookie
 * automatically, and the server checks the org prefix before streaming. */
function photoUrl(key: string): string {
  return `/api/uploads/${key}`;
}

function initialState(
  checkpoints: Checkpoint[],
  observations: Observation[],
): Record<string, AnswerState> {
  const byCp = new Map(observations.map((o) => [o.checkpointId, o]));
  const out: Record<string, AnswerState> = {};
  for (const cp of checkpoints) {
    const o = byCp.get(cp.id);
    const a = o?.answer ?? null;
    out[cp.id] = {
      pass: a && a.type === "pass_fail" ? a.pass : null,
      numeric: a && a.type === "numeric" ? String(a.value) : "",
      rating: a && a.type === "rating" ? a.value : null,
      note: o?.note ?? "",
      photos: (o?.photoKeys ?? []).map((key) => ({
        key,
        url: photoUrl(key),
      })),
    };
  }
  return out;
}

/** Build the API observation payload for a checkpoint, or null if untouched. */
function serialize(cp: Checkpoint, s: AnswerState): object | null {
  const obs: Record<string, unknown> = { checkpointId: cp.id };
  let touched = false;

  if (cp.answerType === "pass_fail" && s.pass !== null) {
    obs.answer = { type: "pass_fail", pass: s.pass };
    touched = true;
  } else if (cp.answerType === "numeric" && s.numeric.trim() !== "") {
    const value = Number(s.numeric);
    if (!Number.isNaN(value)) {
      obs.answer = { type: "numeric", value };
      touched = true;
    }
  } else if (cp.answerType === "rating" && s.rating !== null) {
    obs.answer = { type: "rating", value: s.rating };
    touched = true;
  } else if (cp.answerType === "observation") {
    obs.answer = { type: "observation" };
  }

  if (s.note.trim() !== "") {
    obs.note = s.note.trim();
    touched = true;
  }
  if (s.photos.length > 0) {
    obs.photoKeys = s.photos.map((p) => p.key);
    touched = true;
  }
  return touched ? obs : null;
}

function PassFailControl({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        variant={value === true ? "default" : "outline"}
        onClick={() => onChange(true)}
      >
        Pass
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === false ? "destructive" : "outline"}
        onClick={() => onChange(false)}
      >
        Fail
      </Button>
    </div>
  );
}

function RatingControl({
  scaleMax,
  value,
  onChange,
}: {
  scaleMax: number;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: scaleMax }, (_, i) => i + 1).map((n) => (
        <Button
          key={n}
          type="button"
          size="sm"
          variant={value === n ? "default" : "outline"}
          onClick={() => onChange(n)}
          className="w-9"
        >
          {n}
        </Button>
      ))}
    </div>
  );
}

const SEVERITY_VARIANT = {
  minor: "secondary",
  major: "outline",
  critical: "destructive",
} as const;

function CheckpointCard({
  cp,
  index,
  state,
  uploading,
  onChange,
  onUpload,
  onRemovePhoto,
}: {
  cp: Checkpoint;
  index: number;
  state: AnswerState;
  uploading: boolean;
  onChange: (patch: Partial<AnswerState>) => void;
  onUpload: (files: FileList) => void;
  onRemovePhoto: (key: string) => void;
}) {
  const config = (cp.config ?? {}) as Record<string, number>;
  return (
    <div className="bg-card rounded-lg border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {cp.section && (
            <p className="form-label-mono text-muted-foreground/70 text-[10px] uppercase">
              {cp.section}
            </p>
          )}
          <h3 className="text-lg">
            <span className="text-muted-foreground/60 mr-1.5 text-sm">
              {String(index + 1).padStart(2, "0")}
            </span>
            {cp.prompt}
          </h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {cp.answerType !== "observation" && (
            <Badge variant={SEVERITY_VARIANT[cp.severity]}>{cp.severity}</Badge>
          )}
          {cp.critical && <Badge variant="destructive">critical</Badge>}
        </div>
      </div>

      <div className="mt-4">
        {cp.answerType === "pass_fail" && (
          <PassFailControl
            value={state.pass}
            onChange={(v) => onChange({ pass: v })}
          />
        )}
        {cp.answerType === "numeric" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="any"
              inputMode="decimal"
              value={state.numeric}
              onChange={(e) => onChange({ numeric: e.target.value })}
              className="h-9 max-w-40"
              placeholder="reading"
            />
            {config.okMin != null && (
              <span className="form-label-mono text-muted-foreground/70 text-[10px]">
                ok {config.okMin}–{config.okMax}
              </span>
            )}
          </div>
        )}
        {cp.answerType === "rating" && (
          <RatingControl
            scaleMax={config.scaleMax ?? 5}
            value={state.rating}
            onChange={(v) => onChange({ rating: v })}
          />
        )}
        {cp.answerType === "observation" && (
          <p className="text-muted-foreground text-sm">
            Context only — add a note and/or photo.
          </p>
        )}
      </div>

      <Textarea
        value={state.note}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Note (optional)"
        rows={2}
        className="mt-3"
      />

      <div className="mt-3">
        <div className="flex items-center gap-3">
          <Label
            htmlFor={`photo-${cp.id}`}
            className={cn(
              "border-input hover:bg-accent inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-sm",
              uploading && "pointer-events-none opacity-50",
            )}
          >
            {uploading ? "Uploading…" : "+ Photo"}
          </Label>
          <input
            id={`photo-${cp.id}`}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onUpload(e.target.files);
              e.target.value = "";
            }}
          />
          {cp.photoRequired && (
            <span className="form-label-mono text-stamp text-[10px]">
              photo required
            </span>
          )}
        </div>
        {state.photos.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {state.photos.map((p) => (
              <div key={p.key} className="group/photo relative">
                <img
                  src={p.url}
                  alt="observation"
                  className="bg-muted h-16 w-16 rounded border object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(p.key)}
                  className="bg-background/90 absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border text-xs"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InspectionCapture({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  // The freshest inspection: the action's result if present, else the loader's.
  const inspection =
    fetcher.data && "inspection" in fetcher.data
      ? fetcher.data.inspection
      : loaderData.inspection;
  const checkpoints = inspection.form.checkpoints;
  const submitted = inspection.status === "submitted";
  const busy = fetcher.state !== "idle";

  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() =>
    initialState(checkpoints, inspection.observations),
  );
  const [uploadingCp, setUploadingCp] = useState<string | null>(null);

  // Toasts on action completion.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      toast.success(
        fetcher.data.inspection.status === "submitted"
          ? "Inspection submitted"
          : "Draft saved",
      );
    }
  }, [fetcher.state, fetcher.data]);

  function patch(cpId: string, p: Partial<AnswerState>) {
    setAnswers((a) => ({ ...a, [cpId]: { ...a[cpId], ...p } }));
  }

  async function uploadPhotos(cpId: string, files: FileList) {
    setUploadingCp(cpId);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!res.ok) {
          toast.error("Upload failed");
          continue;
        }
        const { key } = (await res.json()) as { key: string };
        const photo: Photo = { key, url: photoUrl(key) };
        setAnswers((a) => ({
          ...a,
          [cpId]: { ...a[cpId], photos: [...a[cpId].photos, photo] },
        }));
      }
    } finally {
      setUploadingCp(null);
    }
  }

  function removePhoto(cpId: string, key: string) {
    setAnswers((a) => ({
      ...a,
      [cpId]: {
        ...a[cpId],
        photos: a[cpId].photos.filter((p) => p.key !== key),
      },
    }));
  }

  function buildObservations(): object[] {
    const out: object[] = [];
    for (const cp of checkpoints) {
      const obs = serialize(cp, answers[cp.id]);
      if (obs) out.push(obs);
    }
    return out;
  }

  function send(intent: "save" | "submit") {
    // Round-trip through JSON so the typed payload satisfies SubmitTarget.
    const body = JSON.parse(
      JSON.stringify({ intent, observations: buildObservations() }),
    );
    fetcher.submit(body, { method: "post", encType: "application/json" });
  }

  function remove() {
    if (!confirm("Delete this inspection?")) return;
    fetcher.submit(
      { intent: "delete" },
      { method: "post", encType: "application/json" },
    );
  }

  const answeredCount = useMemo(
    () =>
      checkpoints.filter((cp) => {
        const s = answers[cp.id];
        if (cp.answerType === "observation") return true;
        if (cp.answerType === "pass_fail") return s.pass !== null;
        if (cp.answerType === "numeric") return s.numeric.trim() !== "";
        if (cp.answerType === "rating") return s.rating !== null;
        return false;
      }).length,
    [checkpoints, answers],
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="form-label-mono text-muted-foreground">
            <Link to="/app/inspections" className="hover:text-foreground">
              Inspections
            </Link>{" "}
            / capture
          </p>
          <h1 className="mt-2 truncate text-2xl">
            {inspection.equipment.name}
          </h1>
          {(inspection.client || inspection.facility) && (
            <p className="form-label-mono text-muted-foreground/70 mt-1 text-[10px]">
              {[inspection.client?.name, inspection.facility?.name]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <p className="text-muted-foreground mt-1 text-sm">
            {inspection.form.name} · {answeredCount}/{checkpoints.length}{" "}
            answered{" "}
            <Badge
              variant={submitted ? "default" : "secondary"}
              className="ml-1 align-middle"
            >
              {inspection.status}
            </Badge>
          </p>
        </div>
        {!submitted && (
          <Button
            variant="outline"
            onClick={remove}
            disabled={busy}
            className="text-destructive shrink-0"
          >
            Delete
          </Button>
        )}
      </div>

      {inspection.locationMismatch && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive mt-4 rounded-lg border p-3 text-sm">
          ⚠ Captured location is{" "}
          {Math.round(inspection.locationDistanceMeters ?? 0)} m from where this
          equipment is registered.
        </div>
      )}

      <div className="rule-perforated mt-6" />

      {submitted && (
        <div className="bg-muted/50 mt-6 rounded-lg border p-4 text-sm">
          This inspection is submitted and read-only. The verdict view arrives
          in the next phase.
        </div>
      )}

      <div className={cn("mt-6 space-y-4", submitted && "pointer-events-none opacity-70")}>
        {checkpoints.map((cp, i) => (
          <CheckpointCard
            key={cp.id}
            cp={cp}
            index={i}
            state={answers[cp.id]}
            uploading={uploadingCp === cp.id}
            onChange={(p) => patch(cp.id, p)}
            onUpload={(files) => uploadPhotos(cp.id, files)}
            onRemovePhoto={(key) => removePhoto(cp.id, key)}
          />
        ))}
        {checkpoints.length === 0 && (
          <p className="text-muted-foreground text-sm">
            This form has no checkpoints.{" "}
            <Link to={`/app/forms/${inspection.formId}`} className="underline">
              Add some
            </Link>
            .
          </p>
        )}
      </div>

      {!submitted && (
        <div className="bg-background/95 sticky bottom-0 mt-6 flex gap-3 border-t py-4">
          <Button variant="outline" onClick={() => send("save")} disabled={busy}>
            Save draft
          </Button>
          <Button onClick={() => send("submit")} disabled={busy}>
            {busy ? "Working…" : "Submit inspection"}
          </Button>
        </div>
      )}
    </div>
  );
}
