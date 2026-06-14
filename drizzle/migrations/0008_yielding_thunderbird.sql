CREATE TABLE `equipment_type_forms` (
	`org_id` text NOT NULL,
	`type_id` text NOT NULL,
	`form_id` text NOT NULL,
	PRIMARY KEY(`type_id`, `form_id`),
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`type_id`) REFERENCES `equipment_types`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `equipment_type_forms_org_id_idx` ON `equipment_type_forms` (`org_id`);--> statement-breakpoint
CREATE INDEX `equipment_type_forms_form_id_idx` ON `equipment_type_forms` (`form_id`);--> statement-breakpoint
-- Backfill the join from the old single form_id before equipment_types is
-- rebuilt without that column. (No-op while no equipment types exist yet — if
-- any did, this must precede the rebuild's implicit row delete.)
INSERT INTO `equipment_type_forms` (`org_id`, `type_id`, `form_id`)
SELECT `org_id`, `id`, `form_id` FROM `equipment_types`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_equipment_types` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_equipment_types`("id", "org_id", "name", "description", "created_at", "updated_at") SELECT "id", "org_id", "name", "description", "created_at", "updated_at" FROM `equipment_types`;--> statement-breakpoint
DROP TABLE `equipment_types`;--> statement-breakpoint
ALTER TABLE `__new_equipment_types` RENAME TO `equipment_types`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `equipment_types_org_id_idx` ON `equipment_types` (`org_id`);
