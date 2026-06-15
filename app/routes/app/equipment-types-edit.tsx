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
import type {
  FieldDef,
  FieldType,
} from "../../../workers/api/db/schema/equipment";
import type { EquipmentTypeWithForms } from "../../../workers/api/repositories/equipment-types-repo";
import type { Form as InspectionForm } from "../../../workers/api/repositories/forms-repo";
import type { Route } from "./+types/equipment-types-edit";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.type.name ?? "Type"} — inspkt` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [typeRes, formsRes] = await Promise.all([
    apiFetch<{ type: EquipmentTypeWithForms }>(
      request,
      `/api/equipment-types/${params.typeId}`,
    ),
    apiFetch<{ forms: InspectionForm[] }>(request, "/api/forms"),
  ]);
  return { type: typeRes.type, forms: formsRes.forms };
}

export async function action({ request, params }: Route.ActionArgs) {
  const body = (await request.json()) as {
    intent: "save" | "delete";
    name?: string;
    description?: string;
    formIds?: string[];
    fields?: FieldDef[];
  };
  const base = `/api/equipment-types/${params.typeId}`;

  if (body.intent === "delete") {
    try {
      await apiFetch(request, base, { method: "DELETE" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        return { ok: false as const, error: e.body };
      }
      throw e;
    }
    throw redirect("/app/equipment-types");
  }

  try {
    const res = await apiFetch<{ type: EquipmentTypeWithForms }>(request, base, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: body.name,
        description: body.description ?? null,
        formIds: body.formIds,
        fields: body.fields,
      }),
    });
    return { ok: true as const, type: res.type };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 400 || e.status === 422)) {
      return {
        ok: false as const,
        error: "Some fields are invalid — check keys, labels, and options.",
      };
    }
    throw e;
  }
}

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes / no" },
  { value: "select", label: "Dropdown" },
  { value: "multiselect", label: "Multi-select" },
  { value: "file", label: "File / document" },
];

const NEEDS_OPTIONS = (t: FieldType) =>
  t === "select" || t === "multiselect";

interface FieldDraft {
  uiKey: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  optionsText: string; // newline/comma list for select/multiselect
  helpText: string;
}

let counter = 0;
const nextKey = () => `f${counter++}`;

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z]/.test(slug) ? slug : `f_${slug}`;
}

function fieldToDraft(f: FieldDef): FieldDraft {
  return {
    uiKey: nextKey(),
    key: f.key,
    label: f.label,
    type: f.type,
    required: f.required,
    optionsText: (f.options ?? []).join("\n"),
    helpText: f.helpText ?? "",
  };
}

/** Build a FieldDef from a draft, or an error string. */
function draftToField(d: FieldDraft, index: number): FieldDef | string {
  const label = d.label.trim();
  if (!label) return `Field ${index + 1}: a label is required.`;
  const key = (d.key.trim() || slugify(label)).trim();
  if (!/^[a-z][a-z0-9_]*$/.test(key))
    return `Field ${index + 1}: key "${key}" must be snake_case (a-z, 0-9, _).`;
  const field: FieldDef = { key, label, type: d.type, required: d.required };
  if (NEEDS_OPTIONS(d.type)) {
    const options = d.optionsText
      .split(/[\n,]/)
      .map((o) => o.trim())
      .filter(Boolean);
    if (options.length === 0)
      return `Field ${index + 1}: a ${d.type} field needs options.`;
    field.options = options;
  }
  if (d.helpText.trim()) field.helpText = d.helpText.trim();
  return field;
}

function FieldEditor(props: {
  draft: FieldDraft;
  index: number;
  total: number;
  onChange: (patch: Partial<FieldDraft>) => void;
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
            ↑
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => props.onMove(1)}
            className="text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
          >
            ↓
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

      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px]">
        <div>
          <Label className="text-xs">Label</Label>
          <Input
            value={d.label}
            placeholder="License Plate"
            onChange={(e) => {
              const label = e.target.value;
              // keep key in sync until the user edits it manually
              const autoKey = d.key === "" || d.key === slugify(d.label);
              onChange({ label, ...(autoKey ? { key: slugify(label) } : {}) });
            }}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Key</Label>
          <Input
            value={d.key}
            placeholder="license_plate"
            onChange={(e) => onChange({ key: e.target.value })}
            className="mt-1 font-mono text-xs"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div className="w-44">
          <Label className="text-xs">Type</Label>
          <Select
            value={d.type}
            onValueChange={(v) => onChange({ type: v as FieldType })}
          >
            <SelectTrigger className="mt-1 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <Checkbox
            checked={d.required}
            onCheckedChange={(v) => onChange({ required: v === true })}
          />
          Required
        </label>
      </div>

      {NEEDS_OPTIONS(d.type) && (
        <div className="mt-3">
          <Label className="text-xs">Options (one per line)</Label>
          <Textarea
            value={d.optionsText}
            onChange={(e) => onChange({ optionsText: e.target.value })}
            placeholder={"Sedan\nVan\nTruck"}
            rows={3}
            className="mt-1"
          />
        </div>
      )}

      <div className="mt-3">
        <Label className="text-xs">Help text (optional)</Label>
        <Input
          value={d.helpText}
          onChange={(e) => onChange({ helpText: e.target.value })}
          className="mt-1"
        />
      </div>
    </div>
  );
}

export default function EquipmentTypesEdit({
  loaderData,
}: Route.ComponentProps) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  const initial = loaderData.type;
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [formIds, setFormIds] = useState<string[]>(
    initial.forms.map((f) => f.id),
  );
  const [drafts, setDrafts] = useState<FieldDraft[]>(() =>
    initial.fields.map(fieldToDraft),
  );

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      const t = fetcher.data.type;
      setFormIds(t.forms.map((f) => f.id));
      setDrafts(t.fields.map(fieldToDraft));
      toast.success("Type saved");
    } else if (fetcher.state === "idle" && fetcher.data?.ok === false) {
      try {
        toast.error(
          (JSON.parse(fetcher.data.error) as { error?: string }).error ??
            fetcher.data.error,
        );
      } catch {
        toast.error(fetcher.data.error);
      }
    }
  }, [fetcher.state, fetcher.data]);

  function patchDraft(uiKey: string, patch: Partial<FieldDraft>) {
    setDrafts((ds) =>
      ds.map((d) => (d.uiKey === uiKey ? { ...d, ...patch } : d)),
    );
  }
  function moveDraft(uiKey: string, dir: -1 | 1) {
    setDrafts((ds) => {
      const i = ds.findIndex((d) => d.uiKey === uiKey);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function save() {
    if (!name.trim()) {
      toast.error("Give the type a name.");
      return;
    }
    const fields: FieldDef[] = [];
    for (const [i, d] of drafts.entries()) {
      const f = draftToField(d, i);
      if (typeof f === "string") {
        toast.error(f);
        return;
      }
      fields.push(f);
    }
    if (new Set(fields.map((f) => f.key)).size !== fields.length) {
      toast.error("Field keys must be unique.");
      return;
    }
    const payload = JSON.parse(
      JSON.stringify({
        intent: "save",
        name: name.trim(),
        description: description.trim(),
        formIds,
        fields,
      }),
    );
    fetcher.submit(payload, { method: "post", encType: "application/json" });
  }

  function remove() {
    if (!confirm("Delete this equipment type?")) return;
    fetcher.submit(
      { intent: "delete" },
      { method: "post", encType: "application/json" },
    );
  }

  const fieldCount = useMemo(() => drafts.length, [drafts]);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="form-label-mono text-muted-foreground">
            <Link to="/app/equipment-types" className="hover:text-foreground">
              Equipment types
            </Link>{" "}
            / editor
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 h-11 max-w-xl text-2xl font-semibold"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What kind of asset is this?"
            className="mt-2 max-w-xl"
            rows={2}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={remove}
            disabled={busy}
            className="text-destructive"
          >
            Delete
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save type"}
          </Button>
        </div>
      </div>

      <div className="rule-perforated mt-6" />

      {/* Inspection forms */}
      <section className="mt-6">
        <h2 className="text-lg">Inspection forms</h2>
        <p className="text-muted-foreground text-sm">
          The rubrics that apply to this type (optional — attach later).
        </p>
        {loaderData.forms.length === 0 ? (
          <p className="text-muted-foreground mt-3 rounded-md border border-dashed p-3 text-sm">
            No forms yet — create some on the{" "}
            <Link to="/app/forms" className="underline">
              Forms
            </Link>{" "}
            page.
          </p>
        ) : (
          <div className="mt-3 max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">
            {loaderData.forms.map((f) => (
              <label key={f.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={formIds.includes(f.id)}
                  onCheckedChange={(v) =>
                    setFormIds((ids) =>
                      v === true
                        ? [...ids, f.id]
                        : ids.filter((x) => x !== f.id),
                    )
                  }
                />
                {f.name}
              </label>
            ))}
          </div>
        )}
      </section>

      {/* Field schema */}
      <section className="mt-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg">Fields</h2>
            <p className="text-muted-foreground text-sm">
              The metadata every piece of equipment of this type records.
            </p>
          </div>
          <p className="form-label-mono text-muted-foreground/70 text-[10px]">
            {fieldCount} field{fieldCount === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-4 space-y-4">
          {drafts.length === 0 && (
            <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              No fields yet — add the attributes this asset should track (plate,
              VIN, insurance…).
            </div>
          )}
          {drafts.map((d, i) => (
            <FieldEditor
              key={d.uiKey}
              draft={d}
              index={i}
              total={drafts.length}
              onChange={(patch) => patchDraft(d.uiKey, patch)}
              onMove={(dir) => moveDraft(d.uiKey, dir)}
              onRemove={() =>
                setDrafts((ds) => ds.filter((x) => x.uiKey !== d.uiKey))
              }
            />
          ))}
        </div>

        <Button
          variant="outline"
          className="mt-4"
          onClick={() =>
            setDrafts((ds) => [
              ...ds,
              {
                uiKey: nextKey(),
                key: "",
                label: "",
                type: "text",
                required: false,
                optionsText: "",
                helpText: "",
              },
            ])
          }
        >
          + Add field
        </Button>
      </section>
    </div>
  );
}
