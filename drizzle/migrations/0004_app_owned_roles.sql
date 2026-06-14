-- App-owned RBAC: remap mirrored provider roles to app roles in `memberships`.
-- "org:admin" -> "admin"; anything else ("org:member", etc.) -> "inspector".
-- Idempotent: rows already holding app roles are left as-is.
UPDATE `memberships` SET `role` = 'admin' WHERE `role` = 'org:admin';
--> statement-breakpoint
UPDATE `memberships` SET `role` = 'inspector' WHERE `role` NOT IN ('admin', 'manager', 'inspector');
