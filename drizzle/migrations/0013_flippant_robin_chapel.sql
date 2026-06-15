PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`equipment_id` text,
	`item_id` text,
	`form_id` text NOT NULL,
	`inspector_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`captured_lat` real,
	`captured_lng` real,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inspector_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- `equipment_id` is new (nullable) — the old `inspections` table has no such column, so it is omitted from the copy and defaults to NULL. The app sets it on every create; `inspections` is empty on remote, so there is nothing to backfill.
INSERT INTO `__new_inspections`("id", "org_id", "item_id", "form_id", "inspector_user_id", "status", "captured_lat", "captured_lng", "submitted_at", "created_at", "updated_at") SELECT "id", "org_id", "item_id", "form_id", "inspector_user_id", "status", "captured_lat", "captured_lng", "submitted_at", "created_at", "updated_at" FROM `inspections`;--> statement-breakpoint
DROP TABLE `inspections`;--> statement-breakpoint
ALTER TABLE `__new_inspections` RENAME TO `inspections`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `inspections_org_id_idx` ON `inspections` (`org_id`);--> statement-breakpoint
CREATE INDEX `inspections_equipment_id_idx` ON `inspections` (`equipment_id`);--> statement-breakpoint
CREATE INDEX `inspections_item_id_idx` ON `inspections` (`item_id`);