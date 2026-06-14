ALTER TABLE `items` ADD `client_id` text REFERENCES clients(id);--> statement-breakpoint
CREATE INDEX `facilities_client_id_idx` ON `items` (`client_id`);--> statement-breakpoint
-- Backfill: every existing facility predates clients, so create one default
-- "Unassigned" client per org (that doesn't already have one) and point its
-- facilities at it. New facilities always get a client via the app.
INSERT INTO `clients` (`id`, `org_id`, `name`, `notes`, `created_at`, `updated_at`)
SELECT 'cl_' || lower(hex(randomblob(12))), o.`org_id`, 'Unassigned',
       'Auto-created during the facilities migration.', unixepoch(), unixepoch()
FROM (SELECT DISTINCT `org_id` FROM `items` WHERE `client_id` IS NULL) o
WHERE NOT EXISTS (
  SELECT 1 FROM `clients` c WHERE c.`org_id` = o.`org_id` AND c.`name` = 'Unassigned'
);
--> statement-breakpoint
UPDATE `items` SET `client_id` = (
  SELECT c.`id` FROM `clients` c
  WHERE c.`org_id` = `items`.`org_id` AND c.`name` = 'Unassigned'
  ORDER BY c.`created_at` LIMIT 1
) WHERE `client_id` IS NULL;
