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
import { Textarea } from "~/components/ui/textarea";
import { actorFromRole, can, landingPath } from "~/lib/capabilities";
import { ApiError, apiFetch } from "~/lib/api-client.server";
import type { EquipmentTypeWithForms } from "../../../workers/api/repositories/equipment-types-repo";
import type { Form as InspectionForm } from "../../../workers/api/repositories/forms-repo";
import type { Route } from "./+types/equipment-types-list";

export function meta() {
  return [{ title: "Equipment types — inspkt" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const me = await apiFetch<{ role: string }>(request, "/api/me");
  const actor = actorFromRole(me.role);
  if (!can.setup(actor)) throw redirect(landingPath(actor));

  const [typesRes, formsRes] = await Promise.all([
    apiFetch<{ types: EquipmentTypeWithForms[] }>(
      request,
      "/api/equipment-types",
    ),
    apiFetch<{ forms: InspectionForm[] }>(request, "/api/forms"),
  ]);
  return { types: typesRes.types, forms: formsRes.forms };
}

export async function action({ request }: Route.ActionArgs) {
  const body = (await request.json()) as {
    intent: "create" | "update" | "delete";
    id?: string;
    type?: Record<string, unknown>;
  };

  if (body.intent === "delete") {
    try {
      await apiFetch(request, `/api/equipment-types/${body.id}`, {
        method: "DELETE",
      });
      return { ok: true };
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        return { ok: false, error: e.body };
      }
      throw e;
    }
  }

  const path =
    body.intent === "update"
      ? `/api/equipment-types/${body.id}`
      : "/api/equipment-types";
  await apiFetch(request, path, {
    method: body.intent === "update" ? "PATCH" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body.type ?? {}),
  });
  return { ok: true };
}

const typeFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  // Forms are optional — attach them now or later.
  formIds: z.array(z.string()),
  description: z.string().max(2000).optional(),
});
type TypeFormValues = z.infer<typeof typeFormSchema>;

function toDefaults(t?: EquipmentTypeWithForms): TypeFormValues {
  return {
    name: t?.name ?? "",
    formIds: t?.forms.map((f) => f.id) ?? [],
    description: t?.description ?? "",
  };
}

function TypeDialog({
  type,
  forms,
  trigger,
}: {
  type?: EquipmentTypeWithForms;
  forms: InspectionForm[];
  trigger: React.ReactNode;
}) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const form = useForm<TypeFormValues>({
    resolver: zodResolver(typeFormSchema),
    defaultValues: toDefaults(type),
  });
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (open) form.reset(toDefaults(type));
  }, [open, type, form]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && open) {
      setOpen(false);
      toast.success(type ? "Type updated" : "Type created");
    }
  }, [fetcher.state, fetcher.data, open, type]);

  function onSubmit(values: TypeFormValues) {
    const typePayload: Record<string, unknown> = {
      name: values.name.trim(),
      formIds: values.formIds,
    };
    if (values.description?.trim())
      typePayload.description = values.description.trim();
    const payload = JSON.parse(
      JSON.stringify({
        intent: type ? "update" : "create",
        id: type?.id,
        type: typePayload,
      }),
    );
    fetcher.submit(payload, { method: "post", encType: "application/json" });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span onClick={() => setOpen(true)}>{trigger}</span>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{type ? "Edit type" : "New equipment type"}</DialogTitle>
          <DialogDescription>
            A type carries the form used to inspect equipment of that kind.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Rooftop HVAC" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="formIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Inspection forms (optional)</FormLabel>
                  <p className="text-muted-foreground text-xs">
                    The rubrics that apply to this type. Attach them now or
                    later — an inspection picks one of them.
                  </p>
                  {forms.length === 0 ? (
                    <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
                      No forms yet. Create some on the{" "}
                      <Link to="/app/forms" className="underline">
                        Forms
                      </Link>{" "}
                      page and attach them here later.
                    </p>
                  ) : (
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                      {forms.map((f) => {
                        const checked = field.value?.includes(f.id);
                        return (
                          <label
                            key={f.id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                field.onChange(
                                  v === true
                                    ? [...(field.value ?? []), f.id]
                                    : (field.value ?? []).filter(
                                        (x) => x !== f.id,
                                      ),
                                )
                              }
                            />
                            {f.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : type ? "Save changes" : "Create type"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RowActions({
  type,
  forms,
}: {
  type: EquipmentTypeWithForms;
  forms: InspectionForm[];
}) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === false) {
      try {
        toast.error(
          (JSON.parse(fetcher.data.error ?? "{}") as { error?: string })
            .error ?? "Could not delete type",
        );
      } catch {
        toast.error("Could not delete type");
      }
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="flex items-center justify-end gap-3">
      <TypeDialog
        type={type}
        forms={forms}
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
        disabled={busy}
        onClick={() => {
          if (!confirm(`Delete ${type.name}?`)) return;
          fetcher.submit(
            { intent: "delete", id: type.id },
            { method: "post", encType: "application/json" },
          );
        }}
        className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}

export default function EquipmentTypesList({
  loaderData,
}: Route.ComponentProps) {
  const { types, forms } = loaderData;

  const columns: ColumnDef<EquipmentTypeWithForms>[] = [
    {
      accessorKey: "name",
      header: "Type",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      id: "forms",
      header: "Forms",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.forms.length > 0
            ? row.original.forms.map((f) => f.name).join(", ")
            : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <RowActions type={row.original} forms={forms} />,
    },
  ];

  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">Setup</p>
          <h1 className="mt-2 text-3xl">Equipment types</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The kinds of asset you inspect. A type can carry one or more
            inspection forms.
          </p>
        </div>
        <TypeDialog forms={forms} trigger={<Button>New type</Button>} />
      </div>

      <div className="rule-perforated mt-6" />

      <div className="mt-8">
        {types.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="stamp -rotate-3">No types yet</span>
            <h2 className="text-2xl">Define your first equipment type.</h2>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={types}
            filterColumn="name"
            filterPlaceholder="Search types…"
          />
        )}
      </div>
    </div>
  );
}
