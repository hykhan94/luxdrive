/*
  Warnings:

  - You are about to drop the column `routeTariffId` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the `electric_fleet_config` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `electric_tariffs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `peak_pricing` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `route_tariffs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tariff_change_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tariffs` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `city` on the `bookings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
ALTER TYPE "VehicleClass" ADD VALUE 'ULTRA_LUXURY';

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "routeTariffId",
DROP COLUMN "city",
ADD COLUMN     "city" TEXT NOT NULL;

-- DropTable
DROP TABLE "electric_fleet_config";

-- DropTable
DROP TABLE "electric_tariffs";

-- DropTable
DROP TABLE "peak_pricing";

-- DropTable
DROP TABLE "route_tariffs";

-- DropTable
DROP TABLE "tariff_change_logs";

-- DropTable
DROP TABLE "tariffs";

-- DropEnum
DROP TYPE "City";

-- DropEnum
DROP TYPE "RouteType";

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "electricEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ultraLuxuryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_code_key" ON "cities"("code");

-- CreateIndex
CREATE INDEX "cities_isActive_idx" ON "cities"("isActive");

-- CreateIndex
CREATE INDEX "cities_sortOrder_idx" ON "cities"("sortOrder");
