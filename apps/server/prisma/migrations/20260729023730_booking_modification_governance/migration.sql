-- CreateEnum
CREATE TYPE "BookingChangeActor" AS ENUM ('PARTNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VendorChangeDecision" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TemporaryAssetStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'ARCHIVED', 'REJECTED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "modificationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "modificationVendorSeenAt" TIMESTAMP(3),
ADD COLUMN     "modifiedAt" TIMESTAMP(3),
ADD COLUMN     "temporaryDriverId" TEXT,
ADD COLUMN     "temporaryVehicleId" TEXT;

-- CreateTable
CREATE TABLE "booking_modifications" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "actor" "BookingChangeActor" NOT NULL,
    "actorUserId" TEXT,
    "changedFields" JSONB NOT NULL,
    "reason" TEXT,
    "vendorDecision" "VendorChangeDecision" NOT NULL DEFAULT 'NOT_REQUIRED',
    "vendorDecisionReason" TEXT,
    "vendorDecidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_modifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_deletion_requests" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "partnerId" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_policy_config" (
    "id" TEXT NOT NULL,
    "partnerChangeCutoffHours" INTEGER NOT NULL DEFAULT 12,
    "vendorChangeCutoffHours" INTEGER NOT NULL DEFAULT 12,
    "partnerCancelCutoffHours" INTEGER NOT NULL DEFAULT 12,
    "vendorCancelCutoffHours" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "booking_policy_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporary_vehicles" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "vehicleClass" "VehicleClass" NOT NULL,
    "frontPhotoUrl" TEXT NOT NULL,
    "backPhotoUrl" TEXT NOT NULL,
    "status" "TemporaryAssetStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "singleUse" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "completedBookingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "temporary_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporary_drivers" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "photoVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "TemporaryAssetStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "singleUse" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "completedBookingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "temporary_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_modifications_bookingId_idx" ON "booking_modifications"("bookingId");

-- CreateIndex
CREATE INDEX "booking_modifications_vendorDecision_idx" ON "booking_modifications"("vendorDecision");

-- CreateIndex
CREATE INDEX "booking_deletion_requests_bookingId_idx" ON "booking_deletion_requests"("bookingId");

-- CreateIndex
CREATE INDEX "booking_deletion_requests_status_idx" ON "booking_deletion_requests"("status");

-- CreateIndex
CREATE INDEX "temporary_vehicles_vendorId_idx" ON "temporary_vehicles"("vendorId");

-- CreateIndex
CREATE INDEX "temporary_vehicles_status_idx" ON "temporary_vehicles"("status");

-- CreateIndex
CREATE INDEX "temporary_drivers_vendorId_idx" ON "temporary_drivers"("vendorId");

-- CreateIndex
CREATE INDEX "temporary_drivers_status_idx" ON "temporary_drivers"("status");

-- CreateIndex
CREATE INDEX "bookings_deletedAt_idx" ON "bookings"("deletedAt");

-- CreateIndex
CREATE INDEX "bookings_modifiedAt_idx" ON "bookings"("modifiedAt");

-- CreateIndex
CREATE INDEX "bookings_temporaryVehicleId_idx" ON "bookings"("temporaryVehicleId");

-- CreateIndex
CREATE INDEX "bookings_temporaryDriverId_idx" ON "bookings"("temporaryDriverId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_temporaryVehicleId_fkey" FOREIGN KEY ("temporaryVehicleId") REFERENCES "temporary_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_temporaryDriverId_fkey" FOREIGN KEY ("temporaryDriverId") REFERENCES "temporary_drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_modifications" ADD CONSTRAINT "booking_modifications_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deletion_requests" ADD CONSTRAINT "booking_deletion_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_deletion_requests" ADD CONSTRAINT "booking_deletion_requests_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_vehicles" ADD CONSTRAINT "temporary_vehicles_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_drivers" ADD CONSTRAINT "temporary_drivers_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
