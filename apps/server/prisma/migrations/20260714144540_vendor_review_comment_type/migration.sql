-- CreateEnum
CREATE TYPE "VendorReviewCommentType" AS ENUM ('ADMIN_REJECTION', 'VENDOR_REQUEST', 'ADMIN_COMMENT');

-- AlterTable
ALTER TABLE "vendor_review_comments" ADD COLUMN     "type" "VendorReviewCommentType" NOT NULL DEFAULT 'ADMIN_REJECTION';

-- CreateIndex
CREATE INDEX "vendor_review_comments_type_idx" ON "vendor_review_comments"("type");
