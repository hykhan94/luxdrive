-- CreateTable
CREATE TABLE "PartnerChangeRequest" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerChangeRequest_partnerId_status_idx" ON "PartnerChangeRequest"("partnerId", "status");

-- AddForeignKey
ALTER TABLE "PartnerChangeRequest" ADD CONSTRAINT "PartnerChangeRequest_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
