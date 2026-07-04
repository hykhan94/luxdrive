-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "statusBeforeSuspension" "PartnerStatus",
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedBy" TEXT,
ADD COLUMN     "suspensionReason" TEXT;
