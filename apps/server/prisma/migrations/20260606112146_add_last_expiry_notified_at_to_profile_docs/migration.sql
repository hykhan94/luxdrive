-- AlterTable
ALTER TABLE "partner_documents" ADD COLUMN     "lastExpiryNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vendor_documents" ADD COLUMN     "lastExpiryNotifiedAt" TIMESTAMP(3);
