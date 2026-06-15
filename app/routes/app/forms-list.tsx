import { useEffect, useRef, useState } from "react";
import { Link, redirect, useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { apiFetch } from "~/lib/api-client.server";
import { cn } from "~/lib/utils";
import type { Form } from "../../../workers/api/repositories/forms-repo";
import type { FormListRow } from "../../../workers/api/services/forms-service";
import type { Route } from "./+types/forms-list";

export function meta() {
  return [{ title: "Forms — inspkt" }];
}

type FormListEntry = FormListRow;

export async function loader({ request }: Route.LoaderArgs) {
  const res = await apiFetch<{ forms: FormListEntry[] }>(request, "/api/forms");
  return { forms: res.forms };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "delete") {
    await apiFetch(request, `/api/forms/${form.get("id")}`, {
      method: "DELETE",
    });
    return { ok: true };
  }

  // create — a bare form; checkpoints are added in the builder.
  const name = String(form.get("name") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  if (!name) return { ok: false, error: "Give your form a name." };

  const res = await apiFetch<{ form: Form }>(request, "/api/forms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      description: description || undefined,
      checkpoints: [],
    }),
  });
  throw redirect(`/app/forms/${res.form.id}`);
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function FormCard({ form }: { form: FormListEntry }) {
  const fetcher = useFetcher();
  const deleting = fetcher.state !== "idle";
  return (
    <div
      className={cn(
        "bg-card rounded-lg border p-5 transition-opacity",
        deleting && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="form-label-mono text-muted-foreground">
          {form.checkpointCount} checkpoint{form.checkpointCount === 1 ? "" : "s"}
        </p>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <input type="hidden" name="id" value={form.id} />
          <button
            type="submit"
            disabled={deleting}
            className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] transition-colors"
          >
            Delete
          </button>
        </fetcher.Form>
      </div>
      <Link to={`/app/forms/${form.id}`} className="block">
        <h2 className="mt-2 truncate text-xl hover:underline">{form.name}</h2>
      </Link>
      {form.description && (
        <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
          {form.description}
        </p>
      )}
      <p className="text-muted-foreground/80 mt-2 line-clamp-1 text-xs">
        {form.types.length > 0
          ? form.types.map((t) => t.name).join(", ")
          : "Not applied to any equipment type"}
      </p>
      <div className="rule-perforated mt-4" />
      <p className="form-label-mono text-muted-foreground/70 mt-3 text-[10px]">
        {dateFormat.format(new Date(form.updatedAt * 1000))}
      </p>
    </div>
  );
}

function NewFormDialog() {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok === false) {
      // stay open to show the error
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>New form</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New inspection form</DialogTitle>
          <DialogDescription>
            Name the rubric — you'll add checkpoints in the builder next.
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form method="post" ref={formRef} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Quarterly HVAC Check"
              autoFocus
              required
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="What does this form inspect?"
              className="mt-1.5"
            />
          </div>
          {fetcher.data && fetcher.data.ok === false && (
            <p className="text-destructive text-sm">{fetcher.data.error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create form"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

export default function FormsList({ loaderData }: Route.ComponentProps) {
  const { forms } = loaderData;
  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="form-label-mono text-muted-foreground">
            Inspection rubrics
          </p>
          <h1 className="mt-2 text-3xl">Forms</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Define the rubric once — inspect against it consistently.
          </p>
        </div>
        <NewFormDialog />
      </div>

      <div className="rule-perforated mt-6" />

      {forms.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <span className="stamp -rotate-3">No forms yet</span>
          <h2 className="text-2xl">Encode your first inspection standard.</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            A form is an ordered set of checkpoints — what to check, how it's
            answered, and what counts as a failure.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <FormCard key={form.id} form={form} />
          ))}
        </div>
      )}
    </div>
  );
}
