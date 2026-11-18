CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`reason` text NOT NULL,
	`action_label` text NOT NULL,
	`instruction` text NOT NULL,
	`priority` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cards_user` ON `cards` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `files_project` ON `files` (`user_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `handoff_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`handoff_id` text NOT NULL,
	`user_id` text NOT NULL,
	`position` integer NOT NULL,
	`action` text NOT NULL,
	`url` text NOT NULL,
	`note` text NOT NULL,
	`fields` text,
	`snapshot` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `steps_handoff` ON `handoff_steps` (`handoff_id`,`position`);--> statement-breakpoint
CREATE TABLE `handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text,
	`goal` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `handoffs_user` ON `handoffs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `memories_user` ON `memories` (`user_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'done' NOT NULL,
	`source` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_thread` ON `messages` (`user_id`,`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_user` ON `projects` (`user_id`,`last_activity_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`project_id` text,
	`instruction` text NOT NULL,
	`schedule` text NOT NULL,
	`date` text,
	`time` text NOT NULL,
	`weekday` integer,
	`time_zone` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`next_run_at` integer,
	`last_run_at` integer,
	`last_run_status` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_user` ON `tasks` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_due` ON `tasks` (`status`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`org_id` text NOT NULL,
	`cards_at` integer,
	`created_at` integer NOT NULL
);
