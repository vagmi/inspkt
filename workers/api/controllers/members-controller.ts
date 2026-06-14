import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { can } from "~/lib/capabilities";
import { requireCapability } from "../middleware/auth";
import type { ApiEnv } from "../types";
import { memberRoleSchema } from "../validation";

/** /api/members — list the active org's members; remove one (admin only).
 * Mounted inside the authed group, so c.var.{orgId,services} are present.
 *
 * The Clerk client is request-scoped (c.get("clerk")), so the controller builds
 * the Clerk-backed closures and hands them to the service — keeping the service
 * SDK-agnostic and unit-testable. */
export function createMembersController() {
  const app = new Hono<ApiEnv>();

  app.get("/", async (c) => {
    const clerk = c.get("clerk");
    const orgId = c.var.orgId;

    const members = await c.var.services.members.listMembers(orgId, async () => {
      const res = await clerk.organizations.getOrganizationMembershipList({
        organizationId: orgId,
        limit: 100,
      });
      return res.data
        .map((m) => ({
          userId: m.publicUserData?.userId ?? "",
          role: m.role,
          email: m.publicUserData?.identifier ?? "",
          firstName: m.publicUserData?.firstName ?? null,
          lastName: m.publicUserData?.lastName ?? null,
          imageUrl: m.publicUserData?.imageUrl ?? null,
        }))
        .filter((m) => m.userId);
    });

    return c.json({ members });
  });

  // Change a member's app role — authorization lives in our DB, so this is a
  // pure local write (no provider call). Admins only.
  app.patch(
    "/:userId/role",
    requireCapability(can.manageRoles),
    zValidator("json", memberRoleSchema),
    async (c) => {
      const membership = await c.var.services.members.setMemberRole(
        c.var.orgId,
        c.req.param("userId"),
        c.req.valid("json").role,
      );
      return c.json({ membership });
    },
  );

  app.delete("/:userId", requireCapability(can.removeMember), async (c) => {
    const clerk = c.get("clerk");
    const orgId = c.var.orgId;
    const userId = c.req.param("userId");

    await c.var.services.members.removeMember(orgId, userId, async () => {
      await clerk.organizations.deleteOrganizationMembership({
        organizationId: orgId,
        userId,
      });
    });

    return c.json({ ok: true });
  });

  return app;
}
