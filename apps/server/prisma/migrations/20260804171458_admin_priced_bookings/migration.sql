-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "isReadByPartner" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isReadByVendor" BOOLEAN NOT NULL DEFAULT true;
