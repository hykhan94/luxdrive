-- AlterEnum
ALTER TYPE "PartnerReviewCommentType" ADD VALUE 'ADMIN_COMMENT';

-- AlterTable
ALTER TABLE "partner_review_comments" ADD COLUMN     "type" "PartnerReviewCommentType" NOT NULL DEFAULT 'ADMIN_REJECTION';

-- CreateIndex
CREATE INDEX "partner_review_comments_type_idx" ON "partner_review_comments"("type");
