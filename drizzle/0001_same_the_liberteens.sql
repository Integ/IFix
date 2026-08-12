ALTER TABLE `repairs` ADD `actual_charge` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repairs` ADD `is_paid` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `repairs` ADD `serial_number` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_repairs_status_due_at` ON `repairs` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_repairs_customer` ON `repairs` (`customer`);--> statement-breakpoint
CREATE INDEX `idx_parts_repair_id` ON `parts` (`repair_id`);--> statement-breakpoint
CREATE INDEX `idx_parts_status_expected_at` ON `parts` (`status`,`expected_at`);