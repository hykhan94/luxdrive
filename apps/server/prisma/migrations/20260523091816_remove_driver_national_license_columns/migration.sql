/*
  Warnings:

  - You are about to drop the column `licenseExpiry` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `licenseNumber` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `nationalId` on the `drivers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "drivers" DROP COLUMN "licenseExpiry",
DROP COLUMN "licenseNumber",
DROP COLUMN "nationalId";
