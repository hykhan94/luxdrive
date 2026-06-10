-- AlterTable
ALTER TABLE "partner_invoices" ADD COLUMN     "isViewedByPartner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "viewedByPartnerAt" TIMESTAMP(3);
