-- CreateTable
CREATE TABLE "vendor_profile_review_requests" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "fields" TEXT[],
    "message" TEXT NOT NULL,
    "requestType" TEXT NOT NULL DEFAULT 'VENDOR_INITIATED',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "vendor_profile_review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_profile_review_requests_vendorId_idx" ON "vendor_profile_review_requests"("vendorId");

-- CreateIndex
CREATE INDEX "vendor_profile_review_requests_isResolved_idx" ON "vendor_profile_review_requests"("isResolved");

-- CreateIndex
CREATE INDEX "vendor_profile_review_requests_status_idx" ON "vendor_profile_review_requests"("status");

-- AddForeignKey
ALTER TABLE "vendor_profile_review_requests" ADD CONSTRAINT "vendor_profile_review_requests_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
