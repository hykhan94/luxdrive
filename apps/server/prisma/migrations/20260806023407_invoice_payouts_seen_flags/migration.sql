-- AlterTable
ALTER TABLE "partner_invoices" ADD COLUMN     "isViewedByAdmin" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "vendor_payouts" ADD COLUMN     "isViewedByVendor" BOOLEAN NOT NULL DEFAULT false;
