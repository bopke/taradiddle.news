ALTER TABLE `topics` ADD `normalized_title` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `topics` SET `normalized_title` = lower(trim(`title`)) WHERE `normalized_title` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `topics_normalized_title_idx` ON `topics` (`normalized_title`);
