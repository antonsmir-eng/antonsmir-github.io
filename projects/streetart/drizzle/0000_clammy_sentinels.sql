CREATE TABLE `cabinet_order_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`title` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `cabinet_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `cabinet_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cabinet_events_order` ON `cabinet_order_events` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cabinet_files` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `cabinet_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `cabinet_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cabinet_files_order` ON `cabinet_files` (`order_id`);--> statement-breakpoint
CREATE TABLE `cabinet_auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cabinet_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`number` text NOT NULL,
	`title` text NOT NULL,
	`details_json` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`budget` integer NOT NULL,
	`quote` integer,
	`quote_note` text DEFAULT '' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`change_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `cabinet_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_orders_request` ON `cabinet_orders` (`user_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_orders_number` ON `cabinet_orders` (`number`);--> statement-breakpoint
CREATE INDEX `cabinet_orders_owner_created` ON `cabinet_orders` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `cabinet_orders_status_created` ON `cabinet_orders` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `cabinet_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`amount` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_id` text,
	`idempotency_key` text NOT NULL,
	`status` text NOT NULL,
	`confirmation_url` text,
	`reference` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `cabinet_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_payments_provider_id` ON `cabinet_payments` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_payments_key` ON `cabinet_payments` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `cabinet_payments_order` ON `cabinet_payments` (`order_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_payments_active` ON `cabinet_payments` (`order_id`) WHERE provider='yookassa' AND status IN ('creating','pending','waiting_for_capture');--> statement-breakpoint
CREATE TABLE `cabinet_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `cabinet_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cabinet_sessions_user` ON `cabinet_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `cabinet_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cabinet_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`login` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'customer' NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`inn` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`must_change_password` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_users_email` ON `cabinet_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `cabinet_users_login` ON `cabinet_users` (`login`);