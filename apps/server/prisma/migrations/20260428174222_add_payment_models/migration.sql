-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('VISA', 'MADA', 'MASTERCARD', 'APPLE_PAY', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentResponse" AS ENUM ('AUTHORISED', 'DECLINED', 'PENDING', 'ERROR');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "VendorReceiptStatus" AS ENUM ('NEW', 'REVIEWED', 'PAID');

-- CreateEnum
CREATE TYPE "PartnerInvoiceStatus" AS ENUM ('PENDING', 'OVERDUE', 'PAID');

-- CreateEnum
CREATE TYPE "InvoiceGenerationType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "online_payments" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "bookingId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "method" "PaymentMethod" NOT NULL,
    "cardLast4" TEXT,
    "gatewayResponse" "PaymentResponse" NOT NULL,
    "gatewayMessage" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_receipts" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generationType" "InvoiceGenerationType" NOT NULL,
    "bankName" TEXT,
    "iban" TEXT,
    "status" "VendorReceiptStatus" NOT NULL DEFAULT 'NEW',
    "isReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "bookingCount" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "generationType" "InvoiceGenerationType" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PartnerInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "isPaymentReceived" BOOLEAN NOT NULL DEFAULT false,
    "paymentReceivedAt" TIMESTAMP(3),
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_payments_transactionId_key" ON "online_payments"("transactionId");

-- CreateIndex
CREATE INDEX "online_payments_bookingId_idx" ON "online_payments"("bookingId");

-- CreateIndex
CREATE INDEX "online_payments_customerId_idx" ON "online_payments"("customerId");

-- CreateIndex
CREATE INDEX "online_payments_status_idx" ON "online_payments"("status");

-- CreateIndex
CREATE INDEX "online_payments_createdAt_idx" ON "online_payments"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_receipts_receiptNumber_key" ON "vendor_receipts"("receiptNumber");

-- CreateIndex
CREATE INDEX "vendor_receipts_vendorId_idx" ON "vendor_receipts"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_receipts_status_idx" ON "vendor_receipts"("status");

-- CreateIndex
CREATE INDEX "vendor_receipts_createdAt_idx" ON "vendor_receipts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "partner_invoices_invoiceNumber_key" ON "partner_invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "partner_invoices_partnerId_idx" ON "partner_invoices"("partnerId");

-- CreateIndex
CREATE INDEX "partner_invoices_status_idx" ON "partner_invoices"("status");

-- CreateIndex
CREATE INDEX "partner_invoices_dueDate_idx" ON "partner_invoices"("dueDate");

-- CreateIndex
CREATE INDEX "partner_invoices_createdAt_idx" ON "partner_invoices"("createdAt");

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payments" ADD CONSTRAINT "online_payments_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_receipts" ADD CONSTRAINT "vendor_receipts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_invoices" ADD CONSTRAINT "partner_invoices_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
