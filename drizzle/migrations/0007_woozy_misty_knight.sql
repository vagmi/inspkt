CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`facility_id` text NOT NULL,
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
CREATE INDEX `equipment_org_id_idx` ON `equipment` (`org_id`);--> statement-breakpoint
CREATE INDEX `equipment_facility_id_idx` ON `equipment` (`facility_id`);--> statement-breakpoint
CREATE INDEX `equipment_type_id_idx` ON `equipment` (`type_id`);--> statement-breakpoint
CREATE TABLE `equipment_types` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`form_id` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `equipment_types_org_id_idx` ON `equipment_types` (`org_id`);