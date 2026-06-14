PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`facility_id` text,
	`type_id` text NOT NULL,
	`name` text NOT NULL,
	`identifier` text,
	`location_lat` real,
	`location_lng` real,
	`location_label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`facility_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`type_id`) REFERENCES `equipment_types`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_equipment`("id", "org_id", "facility_id", "type_id", "name", "identifier", "location_lat", "location_lng", "location_label", "created_at", "updated_at") SELECT "id", "org_id", "facility_id", "type_id", "name", "identifier", "location_lat", "location_lng", "location_label", "created_at", "updated_at" FROM `equipment`;--> statement-breakpoint
DROP TABLE `equipment`;--> statement-breakpoint
ALTER TABLE `__new_equipment` RENAME TO `equipment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `equipment_org_id_idx` ON `equipment` (`org_id`);--> statement-breakpoint
CREATE INDEX `equipment_facility_id_idx` ON `equipment` (`facility_id`);--> statement-breakpoint
CREATE INDEX `equipment_type_id_idx` ON `equipment` (`type_id`);