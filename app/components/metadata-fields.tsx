import { useState } from "react";
import { toast } from "sonner";
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
import { cn } from "~/lib/utils";
import type { FieldDef } from "../../workers/api/db/schema/equipment";

export type MetadataState = Record<string, unknown>;

/** Keep only the present values for the given fields (drop blanks/empties). */
export function cleanMetadata(
  fields: FieldDef[],
  md: MetadataState,
): MetadataState {
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
export function MetadataFields({
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
                    set(
                      f.key,
                      e.target.value === "" ? "" : Number(e.target.value),
                    )
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
