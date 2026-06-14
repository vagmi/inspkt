CREATE TABLE `inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`item_id` text NOT NULL,
	`form_id` text NOT NULL,
	`inspector_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`captured_lat` real,
	`captured_lng` real,
	`submitted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inspector_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inspections_org_id_idx` ON `inspections` (`org_id`);--> statement-breakpoint
CREATE INDEX `inspections_item_id_idx` ON `inspections` (`item_id`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`inspection_id` text NOT NULL,
	`checkpoint_id` text NOT NULL,
	`answer` text,
	`note` text,
	`photo_keys` text,
	`captured_lat` real,
	`captured_lng` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `checkpoints`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `observations_inspection_id_idx` ON `observations` (`inspection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `observations_inspection_checkpoint_idx` ON `observations` (`inspection_id`,`checkpoint_id`);