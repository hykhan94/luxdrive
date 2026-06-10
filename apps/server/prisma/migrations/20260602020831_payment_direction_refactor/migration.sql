/*
  Warnings:

  - The values [AWAITING_VENDOR,VENDOR_REJECTED,ALL_VENDORS_REJECTED,UNSERVICEABLE] on the enum `BookingStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `rejectionReasons` on the `bookings` table. All the data in the column will be lost.
  - You are about to drop the column `isConfirmed` on the `partner_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `isPaymentReceived` on the `partner_invoices` table. All the data in the column will be lost.
  - You are about to drop the column `paymentReceivedAt` on the `partner_invoices` table. All the data in the column will be lost.
  - The `status` column on the `vendor_payouts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `vendor_receipts` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[receiptNumber]` on the table `vendor_payouts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `generationType` to the `vendor_payouts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `receiptNumber` to the `vendor_payouts` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VendorPayoutStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OfferRejectionReason" AS ENUM ('CAR_DRIVER_UNAVAILABLE', 'PRICE_TOO_LOW', 'UNSUITABLE_ROUTE');

-- AlterEnum
BEGIN;
CREATE TYPE "BookingStatus_new" AS ENUM ('PENDING', 'ASSIGNMENT_OFFERED', 'ASSIGNMENT_RE_OFFERED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."bookings" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "BookingStatus_new" USING ("status"::text::"BookingStatus_new");
ALTER TYPE "BookingStatus" RENAME TO "BookingStatus_old";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";
DROP TYPE "public"."BookingStatus_old";
ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
ALTER TYPE "PartnerInvoiceStatus" ADD VALUE 'PROOF_UPLOADED';

-- DropForeignKey
ALTER TABLE "vendor_receipts" DROP CONSTRAINT "vendor_receipts_vendorId_fkey";

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "rejectionReasons",
ADD COLUMN     "vendorPayoutAmount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "partner_invoices" DROP COLUMN "isConfirmed",
DROP COLUMN "isPaymentReceived",
DROP COLUMN "paymentReceivedAt",
ADD COLUMN     "paymentProofFileName" TEXT,
ADD COLUMN     "paymentProofUploadedAt" TIMESTAMP(3),
ADD COLUMN     "paymentProofUrl" TEXT;

-- AlterTable
ALTER TABLE "vendor_payouts" ADD COLUMN     "generationType" "InvoiceGenerationType" NOT NULL,
ADD COLUMN     "paidBy" TEXT,
ADD COLUMN     "receiptFileName" TEXT,
ADD COLUMN     "receiptNumber" TEXT NOT NULL,
ADD COLUMN     "receiptUploadedAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "VendorPayoutStatus" NOT NULL DEFAULT 'PENDING';

-- DropTable
DROP TABLE "vendor_receipts";

-- DropEnum
DROP TYPE "VendorReceiptStatus";

-- CreateTable
CREATE TABLE "booking_assignment_offers" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "payoutAmount" DECIMAL(10,2) NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "OfferStatus" NOT NULL,
    "rejectionReason" "OfferRejectionReason",
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "booking_assignment_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_assignment_offers_bookingId_status_idx" ON "booking_assignment_offers"("bookingId", "status");

-- CreateIndex
CREATE INDEX "booking_assignment_offers_vendorId_idx" ON "booking_assignment_offers"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_assignment_offers_bookingId_vendorId_attemptNumber_key" ON "booking_assignment_offers"("bookingId", "vendorId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payouts_receiptNumber_key" ON "vendor_payouts"("receiptNumber");

-- CreateIndex
CREATE INDEX "vendor_payouts_status_idx" ON "vendor_payouts"("status");

-- AddForeignKey
ALTER TABLE "booking_assignment_offers" ADD CONSTRAINT "booking_assignment_offers_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_assignment_offers" ADD CONSTRAINT "booking_assignment_offers_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
