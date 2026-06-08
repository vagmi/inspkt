import { getAuth } from "@clerk/react-router/server";
import { useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { actorFromAuth, can } from "~/lib/capabilities";
import { apiFetch } from "~/lib/api-client.server";
import type { MemberView } from "../../../workers/api/repositories/memberships-repo";
import type { Route } from "./+types/members";

export function meta() {
  return [{ title: "Members — Mudhal" }];
}

export async function loader(args: Route.LoaderArgs) {
  // The actor is built from the Clerk SESSION (the live authz authority), then
  // run through the SAME capability used to gate the server route — so the UI
  // can never show a control the API would reject.
  const auth = await getAuth(args);
  const { members } = await apiFetch<{ members: MemberView[] }>(
    args.request,
    "/api/members",
  );
  return {
    members,
    canRemove: can.removeMember(actorFromAuth(auth)),
    selfUserId: auth.userId,
  };
}

export async function action(args: Route.ActionArgs) {
  const form = await args.request.formData();
  const userId = String(form.get("userId") ?? "");
  // Authorization is enforced server-side by requireCapability(can.removeMember)
  // on DELETE /api/members/:userId — the UI gate below is just for UX.
  await apiFetch(args.request, `/api/members/${userId}`, { method: "DELETE" });
  return { ok: true };
}

function fullName(m: MemberView): string {
  const name = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return name || m.email;
}

function roleLabel(role: string): string {
  return role.replace(/^org:/, "");
}

function RemoveButton({ userId }: { userId: string }) {
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      toast.success("Member removed");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form method="post">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={busy}
        className="form-label-mono text-muted-foreground/60 hover:text-destructive text-[10px] transition-colors disabled:opacity-50"
      >
        {busy ? "Removing…" : "Remove"}
      </button>
    </fetcher.Form>
  );
}

export default function Members({ loaderData }: Route.ComponentProps) {
  const { members, canRemove, selfUserId } = loaderData;

  return (
    <div>
      <p className="form-label-mono text-muted-foreground">
        {members.length} {members.length === 1 ? "member" : "members"}
      </p>
      <h1 className="mt-2 text-3xl">Members</h1>
      <p className="text-muted-foreground mt-2 max-w-prose text-sm">
        Everyone in your active organization. Roles come from Clerk; only admins
        can remove a member — the same capability (<code>can.removeMember</code>)
        gates this page and the API.
      </p>

      <div className="rule-perforated mt-6" />

      <div className="mt-8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              {canRemove && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell className="font-medium">
                  {fullName(m)}
                  {m.userId === selfUserId && (
                    <span className="text-muted-foreground"> (you)</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.email}
                </TableCell>
                <TableCell>
                  <span className="form-label-mono">{roleLabel(m.role)}</span>
                </TableCell>
                {canRemove && (
                  <TableCell className="text-right">
                    {m.userId !== selfUserId && (
                      <RemoveButton userId={m.userId} />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
