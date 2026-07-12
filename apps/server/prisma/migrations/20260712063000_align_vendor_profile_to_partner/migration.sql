ALTER TABLE "vendors" RENAME COLUMN "bankAccountName" TO "bankAccountNumber";

ALTER TABLE "vendor_bank_update_requests" RENAME COLUMN "requestedBankAccountName" TO "requestedBankAccountNumber";
ALTER TABLE "vendor_bank_update_requests" RENAME COLUMN "previousBankAccountName" TO "previousBankAccountNumber";

ALTER TABLE "vendors" ADD COLUMN "chamberOfCommerceNumber" TEXT;
ALTER TABLE "vendors" ADD COLUMN "baladyNumber" TEXT;
ALTER TABLE "vendors" ADD COLUMN "nationalAddress" TEXT;