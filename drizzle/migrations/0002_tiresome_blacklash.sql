CREATE TABLE `checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`org_id` text NOT NULL,
	`position` integer NOT NULL,
	`section` text,
	`prompt` text NOT NULL,
	`answer_type` text NOT NULL,
	`severity` text DEFAULT 'minor' NOT NULL,
	`critical` integer DEFAULT false NOT NULL,
	`photo_required` integer DEFAULT false NOT NULL,
	`config` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `checkpoints_form_id_idx` ON `checkpoints` (`form_id`);--> statement-breakpoint
CREATE INDEX `checkpoints_org_id_idx` ON `checkpoints` (`org_id`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `forms_org_id_idx` ON `forms` (`org_id`);