ALTER TABLE `equipment` ADD `client_id` text REFERENCES clients(id);--> statement-breakpoint
CREATE INDEX `equipment_client_id_idx` ON `equipment` (`client_id`);