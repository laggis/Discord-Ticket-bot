-- Discord Ticket Bot schema

CREATE DATABASE IF NOT EXISTS `discordbot` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `discordbot`;

-- Banned users: stores users blocked from creating tickets
CREATE TABLE IF NOT EXISTS `banned_users` (
  `user_id` VARCHAR(20) NOT NULL,
  `reason` TEXT NOT NULL,
  `banned_by` VARCHAR(20) NOT NULL,
  `banned_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tickets: stores ticket metadata used by the bot
CREATE TABLE IF NOT EXISTS `tickets` (
  `id` VARCHAR(36) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'Öppen',
  `created_by` VARCHAR(255) NOT NULL,
  `created_by_id` VARCHAR(20) NOT NULL,
  `subject` VARCHAR(255) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at` TIMESTAMP NULL DEFAULT NULL,
  `closed_by_id` VARCHAR(20) DEFAULT NULL,
  `close_reason` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tickets_created_by_id` (`created_by_id`),
  KEY `idx_tickets_status` (`status`),
  KEY `idx_tickets_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
