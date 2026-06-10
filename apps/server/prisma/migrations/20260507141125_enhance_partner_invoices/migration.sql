-- AlterEnum
ALTER TYPE "InvoiceGenerationType" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "customInvoicedAt" TIMESTAMP(3),
ADD COLUMN     "isCustomInvoiced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partnerInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "partner_invoices" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "dateRangeLabel" TEXT,
ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_partnerInvoiceId_fkey" FOREIGN KEY ("partnerInvoiceId") REFERENCES "partner_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
