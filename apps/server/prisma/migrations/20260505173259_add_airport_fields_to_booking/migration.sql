-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "hourlyDuration" TEXT,
ADD COLUMN     "routeTariffId" TEXT,
ADD COLUMN     "terminalLocation" TEXT,
ADD COLUMN     "terminalNo" TEXT;
