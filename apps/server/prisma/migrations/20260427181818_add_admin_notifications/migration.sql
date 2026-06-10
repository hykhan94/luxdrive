-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "attentionAt" TIMESTAMP(3),
ADD COLUMN     "attentionReason" TEXT,
ADD COLUMN     "isReadByAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "needsAttention" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "bookings_isReadByAdmin_idx" ON "bookings"("isReadByAdmin");

-- CreateIndex
CREATE INDEX "bookings_needsAttention_idx" ON "bookings"("needsAttention");
