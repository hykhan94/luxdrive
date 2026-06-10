-- CreateTable
CREATE TABLE "partner_documents" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_documents_partnerId_idx" ON "partner_documents"("partnerId");

-- CreateIndex
CREATE INDEX "partner_documents_type_idx" ON "partner_documents"("type");

-- CreateIndex
CREATE UNIQUE INDEX "partner_documents_partnerId_type_key" ON "partner_documents"("partnerId", "type");

-- AddForeignKey
ALTER TABLE "partner_documents" ADD CONSTRAINT "partner_documents_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
