-- --------------------------------------------------------
-- Värd:                         127.0.0.1
-- Serverversion:                10.4.32-MariaDB - mariadb.org binary distribution
-- Server-OS:                    Win64
-- HeidiSQL Version:             12.8.0.6908
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Dumpar databasstruktur för discordbot
CREATE DATABASE IF NOT EXISTS `discordbot` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `discordbot`;

-- Dumpar struktur för tabell discordbot.banned_users
CREATE TABLE IF NOT EXISTS `banned_users` (
  `user_id` varchar(20) NOT NULL,
  `reason` text NOT NULL,
  `banned_by` varchar(100) NOT NULL,
  `banned_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Dumpar data för tabell discordbot.banned_users: ~0 rows (ungefär)

-- Dumpar struktur för tabell discordbot.tickets
CREATE TABLE IF NOT EXISTS `tickets` (
  `id` varchar(36) NOT NULL,
  `type` varchar(50) NOT NULL,
  `status` varchar(50) DEFAULT 'Öppen',
  `priority` varchar(50) DEFAULT 'Low',
  `created_by` varchar(255) NOT NULL,
  `created_by_id` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `closed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Dumpar data för tabell discordbot.tickets: ~0 rows (ungefär)

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
