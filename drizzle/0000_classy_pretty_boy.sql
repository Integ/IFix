CREATE TABLE `parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repair_id` integer,
	`name` text NOT NULL,
	`supplier` text NOT NULL,
	`order_no` text DEFAULT '' NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'to_order' NOT NULL,
	`expected_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`repair_id`) REFERENCES `repairs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `repairs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_no` text NOT NULL,
	`device` text NOT NULL,
	`brand_model` text NOT NULL,
	`customer` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`issue` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`received_at` text NOT NULL,
	`due_at` text NOT NULL,
	`estimate` real DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repairs_ticket_no_unique` ON `repairs` (`ticket_no`);