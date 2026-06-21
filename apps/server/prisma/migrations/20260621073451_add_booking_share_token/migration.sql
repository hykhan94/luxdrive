/*
  Warnings:

  - A unique constraint covering the columns `[shareToken]` on the table `bookings` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "bookings_shareToken_key" ON "bookings"("shareToken");
