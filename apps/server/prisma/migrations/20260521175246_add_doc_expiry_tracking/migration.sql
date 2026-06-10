-- AlterTable
ALTER TABLE "driver_documents" ADD COLUMN     "lastExpiryNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "suspendedForDocs" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vehicle_documents" ADD COLUMN     "lastExpiryNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "suspendedForDocs" BOOLEAN NOT NULL DEFAULT false;
