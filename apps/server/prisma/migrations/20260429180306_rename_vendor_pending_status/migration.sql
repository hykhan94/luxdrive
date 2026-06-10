/*
  Warnings:

  - The values [PENDING,REJECTED] on the enum `VendorStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[invitationToken]` on the table `vendors` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'UNDER_MAINTENANCE', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "BankUpdateRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "VendorStatus_new" AS ENUM ('INVITED', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SUSPENDED');
ALTER TABLE "public"."vendors" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "vendors" ALTER COLUMN "status" TYPE "VendorStatus_new" USING ("status"::text::"VendorStatus_new");
ALTER TYPE "VendorStatus" RENAME TO "VendorStatus_old";
ALTER TYPE "VendorStatus_new" RENAME TO "VendorStatus";
DROP TYPE "public"."VendorStatus_old";
ALTER TABLE "vendors" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';
COMMIT;

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "status" "DriverStatus" NOT NULL DEFAULT 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "mileage" INTEGER,
ADD COLUMN     "status" "VehicleStatus" NOT NULL DEFAULT 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "invitationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "invitationSentAt" TIMESTAMP(3),
ADD COLUMN     "invitationToken" TEXT,
ADD COLUMN     "invitedByUserId" TEXT,
ADD COLUMN     "isProfileComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mouExpiryDate" TIMESTAMP(3),
ADD COLUMN     "mouExpiryNotified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mouFileUrl" TEXT,
ADD COLUMN     "mouUploadedAt" TIMESTAMP(3),
ADD COLUMN     "profileReviewedAt" TIMESTAMP(3),
ADD COLUMN     "profileReviewedBy" TEXT,
ADD COLUMN     "profileSubmittedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';

-- CreateTable
CREATE TABLE "vendor_review_comments" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invitation_logs" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT,
    "email" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_invitation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bank_update_requests" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "requestedBankName" TEXT,
    "requestedBankAccountName" TEXT,
    "requestedBankIban" TEXT,
    "previousBankName" TEXT,
    "previousBankAccountName" TEXT,
    "previousBankIban" TEXT,
    "status" "BankUpdateRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "adminNote" TEXT,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_bank_update_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_review_requests" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "fields" TEXT[],
    "message" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "driver_review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_review_requests" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "documents" TEXT[],
    "message" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "vehicle_review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_review_comments_vendorId_idx" ON "vendor_review_comments"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_review_comments_isResolved_idx" ON "vendor_review_comments"("isResolved");

-- CreateIndex
CREATE INDEX "vendor_invitation_logs_email_idx" ON "vendor_invitation_logs"("email");

-- CreateIndex
CREATE INDEX "vendor_invitation_logs_vendorId_idx" ON "vendor_invitation_logs"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_bank_update_requests_vendorId_idx" ON "vendor_bank_update_requests"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_bank_update_requests_status_idx" ON "vendor_bank_update_requests"("status");

-- CreateIndex
CREATE INDEX "driver_review_requests_driverId_idx" ON "driver_review_requests"("driverId");

-- CreateIndex
CREATE INDEX "driver_review_requests_isResolved_idx" ON "driver_review_requests"("isResolved");

-- CreateIndex
CREATE INDEX "vehicle_review_requests_vehicleId_idx" ON "vehicle_review_requests"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_review_requests_isResolved_idx" ON "vehicle_review_requests"("isResolved");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_invitationToken_key" ON "vendors"("invitationToken");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- CreateIndex
CREATE INDEX "vendors_invitationToken_idx" ON "vendors"("invitationToken");

-- CreateIndex
CREATE INDEX "vendors_mouExpiryDate_idx" ON "vendors"("mouExpiryDate");

-- AddForeignKey
ALTER TABLE "vendor_review_comments" ADD CONSTRAINT "vendor_review_comments_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invitation_logs" ADD CONSTRAINT "vendor_invitation_logs_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bank_update_requests" ADD CONSTRAINT "vendor_bank_update_requests_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_review_requests" ADD CONSTRAINT "driver_review_requests_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_review_requests" ADD CONSTRAINT "vehicle_review_requests_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
