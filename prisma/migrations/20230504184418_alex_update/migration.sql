/*
  Warnings:

  - Added the required column `creatorMessage` to the `Group` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Group` ADD COLUMN `creatorMessage` VARCHAR(191) NOT NULL;
