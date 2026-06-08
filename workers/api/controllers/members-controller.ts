import { Hono } from "hono";
import { can } from "~/lib/capabilities";
import { requireCapability } from "../middleware/auth";
import type { ApiEnv } from "../types";

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
