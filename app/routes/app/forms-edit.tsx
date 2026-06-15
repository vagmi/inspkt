import { useEffect, useMemo, useState } from "react";
import { Link, redirect, useFetcher } from "react-router";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { ApiError, apiFetch } from "~/lib/api-client.server";
import type { EquipmentTypeWithForms } from "../../../workers/api/repositories/equipment-types-repo";
import type { Checkpoint } from "../../../workers/api/repositories/forms-repo";
import type { FormWithTypes } from "../../../workers/api/services/forms-service";
import type { Route } from "./+types/forms-edit";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.form.name ?? "Form"} — inspkt` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [formRes, typesRes] = await Promise.all([
    apiFetch<{ form: FormWithTypes }>(request, `/api/forms/${params.formId}`),
    apiFetch<{ types: EquipmentTypeWithForms[] }>(
      request,
      "/api/equipment-types",
    ),
  ]);
  return { form: formRes.form, equipmentTypes: typesRes.types };
}

export async function action({ request, params }: Route.ActionArgs) {
  const body = (await request.json()) as {
    intent: string;
    name?: string;
    description?: string;
    checkpoints?: unknown[];
    typeIds?: string[];
  };

  if (body.intent === "delete") {
    await apiFetch(request, `/api/forms/${params.formId}`, {
      method: "DELETE",
    });
    throw redirect("/app/forms");
  }

  try {
    const res = await apiFetch<{ form: FormWithTypes }>(
      request,
      `/api/forms/${params.formId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: body.name,
          description: body.description ?? null,
          checkpoints: body.checkpoints,
          typeIds: body.typeIds,
        }),
      },
    );
    return { ok: true as const, form: res.form };
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      return { ok: false as const, error: "Some checkpoints are invalid — check ranges and thresholds." };
    }
    throw e;
  }
}

type AnswerType = Checkpoint["answerType"];
type Severity = Checkpoint["severity"];

/** Local editing state: numbers stay strings until save so typing is free. */
interface Draft {
  key: string;
  id?: string;
  section: string;
  prompt: string;
  answerType: AnswerType;
  severity: Severity;
  critical: boolean;
  photoRequired: boolean;
  unit: string;
  okMin: string;
  okMax: string;
  warnMin: string;
  warnMax: string;
  scaleMax: string;
  passMin: string;
  ratingWarnMin: string;
}

let keyCounter = 0;
const nextKey = () => `cp-${keyCounter++}`;

function draftFromCheckpoint(c: Checkpoint): Draft {
  const cfg = (c.config ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));
  return {
    key: nextKey(),
    id: c.id,
    section: c.section ?? "",
    prompt: c.prompt,
    answerType: c.answerType,
    severity: c.severity,
    critical: c.critical,
    photoRequired: c.photoRequired,
    unit: s(cfg.unit),
    okMin: s(cfg.okMin),
    okMax: s(cfg.okMax),
    warnMin: s(cfg.warnMin),
    warnMax: s(cfg.warnMax),
    scaleMax: s(cfg.scaleMax),
    passMin: s(cfg.passMin),
    ratingWarnMin: s(cfg.warnMin),
  };
}

function emptyDraft(): Draft {
  return {
    key: nextKey(),
    section: "",
    prompt: "",
    answerType: "pass_fail",
    severity: "minor",
    critical: false,
    photoRequired: false,
    unit: "",
    okMin: "",
    okMax: "",
    warnMin: "",
    warnMax: "",
    scaleMax: "5",
    passMin: "4",
    ratingWarnMin: "",
  };
}

/** Build the API checkpoint payload, or return an error string. */
function draftToPayload(d: Draft, index: number): object | string {
  const label = `Checkpoint ${index + 1}`;
  if (!d.prompt.trim()) return `${label}: prompt is required.`;
  const base = {
    id: d.id,
    section: d.section.trim() || undefined,
    prompt: d.prompt.trim(),
    severity: d.severity,
    critical: d.answerType === "observation" ? false : d.critical,
    photoRequired: d.photoRequired,
    answerType: d.answerType,
  };
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  if (d.answerType === "numeric") {
    const okMin = num(d.okMin);
    const okMax = num(d.okMax);
    if (okMin === undefined || okMax === undefined)
      return `${label}: numeric checkpoints need an acceptable range.`;
    if (Number.isNaN(okMin) || Number.isNaN(okMax))
      return `${label}: range values must be numbers.`;
    return {
      ...base,
      config: {
        unit: d.unit.trim() || undefined,
        okMin,
        okMax,
        warnMin: num(d.warnMin),
        warnMax: num(d.warnMax),
      },
    };
  }
  if (d.answerType === "rating") {
    const scaleMax = num(d.scaleMax);
    const passMin = num(d.passMin);
    if (scaleMax === undefined || passMin === undefined)
      return `${label}: rating checkpoints need a scale and pass threshold.`;
    return {
      ...base,
      config: {
        scaleMax,
        passMin,
        warnMin: num(d.ratingWarnMin),
      },
    };
  }
  return base;
}

const ANSWER_TYPES: Array<{ value: AnswerType; label: string }> = [
  { value: "pass_fail", label: "Pass / fail" },
  { value: "numeric", label: "Numeric reading" },
  { value: "rating", label: "Rating" },
  { value: "observation", label: "Observation" },
];

const SEVERITIES: Array<{ value: Severity; label: string }> = [
  { value: "minor", label: "Minor" },
  { value: "major", label: "Major" },
  { value: "critical", label: "Critical" },
];

function NumberField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{props.label}</Label>
      <Input
        type="number"
        step="any"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1 h-8"
      />
    </div>
  );
}

function CheckpointEditor(props: {
  draft: Draft;
  index: number;
  total: number;
  onChange: (patch: Partial<Draft>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { draft: d, index, total, onChange } = props;
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="form-label-mono text-muted-foreground">
          № {String(index + 1).padStart(2, "0")}
        </p>
        <div className="form-label-mono flex items-center gap-3 text-[10px]">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => props.onMove(-1)}
            className="text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
          >
            ↑ Up
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => props.onMove(1)}
            className="text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
          >
            ↓ Down
          </button>
          <button
            type="button"
            onClick={props.onRemove}
            className="text-muted-foreground/60 hover:text-destructive"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_200px]">
        <div>
          <Label className="text-xs">Checkpoint</Label>
          <Input
            value={d.prompt}
            placeholder="Condenser coils free of debris"
            onChange={(e) => onChange({ prompt: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Section</Label>
          <Input
            value={d.section}
            placeholder="Exterior"
            onChange={(e) => onChange({ section: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div className="w-44">
          <Label className="text-xs">Answer type</Label>
          <Select
            value={d.answerType}
            onValueChange={(v) => onChange({ answerType: v as AnswerType })}
          >
            <SelectTrigger className="mt-1 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANSWER_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {d.answerType !== "observation" && (
          <div className="w-36">
            <Label className="text-xs">Severity</Label>
            <Select
              value={d.severity}
              onValueChange={(v) => onChange({ severity: v as Severity })}
            >
              <SelectTrigger className="mt-1 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {d.answerType !== "observation" && (
          <label className="flex items-center gap-2 pb-1.5 text-sm">
            <Checkbox
              checked={d.critical}
              onCheckedChange={(v) => onChange({ critical: v === true })}
            />
            Critical — failure fails the inspection
          </label>
        )}
        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <Checkbox
            checked={d.photoRequired}
            onCheckedChange={(v) => onChange({ photoRequired: v === true })}
          />
          Photo required
        </label>
      </div>

      {d.answerType === "numeric" && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <NumberField
            label="OK min"
            value={d.okMin}
            onChange={(v) => onChange({ okMin: v })}
          />
          <NumberField
            label="OK max"
            value={d.okMax}
            onChange={(v) => onChange({ okMax: v })}
          />
          <NumberField
            label="Warn min"
            value={d.warnMin}
            placeholder="optional"
            onChange={(v) => onChange({ warnMin: v })}
          />
          <NumberField
            label="Warn max"
            value={d.warnMax}
            placeholder="optional"
            onChange={(v) => onChange({ warnMax: v })}
          />
          <div>
            <Label className="text-xs">Unit</Label>
            <Input
              value={d.unit}
              placeholder="psi"
              onChange={(e) => onChange({ unit: e.target.value })}
              className="mt-1 h-8"
            />
          </div>
        </div>
      )}

      {d.answerType === "rating" && (
        <div className="mt-3 grid grid-cols-3 gap-3 sm:max-w-md">
          <NumberField
            label="Scale max"
            value={d.scaleMax}
            onChange={(v) => onChange({ scaleMax: v })}
          />
          <NumberField
            label="Pass at ≥"
            value={d.passMin}
            onChange={(v) => onChange({ passMin: v })}
          />
          <NumberField
            label="Warn at ≥"
            value={d.ratingWarnMin}
            placeholder="optional"
            onChange={(v) => onChange({ ratingWarnMin: v })}
          />
        </div>
      )}
    </div>
  );
}

export default function FormsEdit({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  const initialDrafts = useMemo(
    () => loaderData.form.checkpoints.map(draftFromCheckpoint),
    [loaderData.form],
  );
  const [name, setName] = useState(loaderData.form.name);
  const [description, setDescription] = useState(
    loaderData.form.description ?? "",
  );
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [typeIds, setTypeIds] = useState<string[]>(
    loaderData.form.types.map((t) => t.id),
  );

  // Sync local state after a successful save (new checkpoints gain ids).
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setDrafts(fetcher.data.form.checkpoints.map(draftFromCheckpoint));
      setTypeIds(fetcher.data.form.types.map((t) => t.id));
      toast.success("Form saved");
    } else if (fetcher.state === "idle" && fetcher.data?.ok === false) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  function patchDraft(key: string, patch: Partial<Draft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function moveDraft(key: string, dir: -1 | 1) {
    setDrafts((ds) => {
      const i = ds.findIndex((d) => d.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function save() {
    if (!name.trim()) {
      toast.error("Give the form a name.");
      return;
    }
    const payload: object[] = [];
    for (const [i, d] of drafts.entries()) {
      const p = draftToPayload(d, i);
      if (typeof p === "string") {
        toast.error(p);
        return;
      }
      payload.push(p);
    }
    // Round-trip through JSON to drop undefined config fields and satisfy
    // the JsonValue type submit expects.
    const body = JSON.parse(
      JSON.stringify({
        intent: "save",
        name: name.trim(),
        description: description.trim(),
        checkpoints: payload,
        typeIds,
      }),
    );
    fetcher.submit(body, { method: "post", encType: "application/json" });
  }

  function deleteForm() {
    fetcher.submit(
      { intent: "delete" },
      { method: "post", encType: "application/json" },
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="form-label-mono text-muted-foreground">
            <Link to="/app/forms" className="hover:text-foreground">
              Forms
            </Link>{" "}
            / builder
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 h-11 max-w-xl text-2xl font-semibold"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this form inspect?"
            className="mt-2 max-w-xl"
            rows={2}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={deleteForm}
            disabled={busy}
            className="text-destructive"
          >
            Delete
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save form"}
          </Button>
        </div>
      </div>

      <div className="rule-perforated mt-6" />

      {/* Equipment types this form applies to (the reverse of the type editor's
          forms multi-select — the same many-to-many link, edited from here). */}
      <section className="mt-6">
        <h2 className="text-lg">Applies to equipment types</h2>
        <p className="text-muted-foreground text-sm">
          The asset types this rubric can inspect (optional — also editable from
          each type).
        </p>
        {loaderData.equipmentTypes.length === 0 ? (
          <p className="text-muted-foreground mt-3 rounded-md border border-dashed p-3 text-sm">
            No equipment types yet — create some on the{" "}
            <Link to="/app/equipment-types" className="underline">
              Equipment types
            </Link>{" "}
            page.
          </p>
        ) : (
          <div className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">
            {loaderData.equipmentTypes.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={typeIds.includes(t.id)}
                  onCheckedChange={(v) =>
                    setTypeIds((ids) =>
                      v === true
                        ? [...ids, t.id]
                        : ids.filter((x) => x !== t.id),
                    )
                  }
                />
                {t.name}
              </label>
            ))}
          </div>
        )}
      </section>

      <div className="rule-perforated mt-6" />

      <div className="mt-6 space-y-4">
        {drafts.length === 0 && (
          <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No checkpoints yet — add the first thing an inspector should check.
          </div>
        )}
        {drafts.map((d, i) => (
          <CheckpointEditor
            key={d.key}
            draft={d}
            index={i}
            total={drafts.length}
            onChange={(patch) => patchDraft(d.key, patch)}
            onMove={(dir) => moveDraft(d.key, dir)}
            onRemove={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
          />
        ))}
      </div>

      <Button
        variant="outline"
        className="mt-4"
        onClick={() => setDrafts((ds) => [...ds, emptyDraft()])}
      >
        + Add checkpoint
      </Button>
    </div>
  );
}
