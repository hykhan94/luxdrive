/*
  Warnings:

  - The values [PENDING] on the enum `PartnerStatus` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[invitationToken]` on the table `partners` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PartnerStatus_new" AS ENUM ('INVITED', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SUSPENDED');
ALTER TABLE "public"."partners" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "partners" ALTER COLUMN "status" TYPE "PartnerStatus_new" USING ("status"::text::"PartnerStatus_new");
ALTER TYPE "PartnerStatus" RENAME TO "PartnerStatus_old";
ALTER TYPE "PartnerStatus_new" RENAME TO "PartnerStatus";
DROP TYPE "public"."PartnerStatus_old";
ALTER TABLE "partners" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';
COMMIT;

-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "invitationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "invitationSentAt" TIMESTAMP(3),
ADD COLUMN     "invitationToken" TEXT,
ADD COLUMN     "invitedByUserId" TEXT,
ADD COLUMN     "isProfileComplete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mouExpiryDate" TIMESTAMP(3),
ADD COLUMN     "mouExpiryNotified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mouFileUrl" TEXT,
ADD COLUMN     "mouUploadedAt" TIMESTAMP(3),
ADD COLUMN     "profileReviewedAt" TIMESTAMP(3),
ADD COLUMN     "profileReviewedBy" TEXT,
ADD COLUMN     "profileSubmittedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';

-- CreateTable
CREATE TABLE "partner_review_comments" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "partner_review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_invitation_logs" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "email" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_invitation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_review_comments_partnerId_idx" ON "partner_review_comments"("partnerId");

-- CreateIndex
CREATE INDEX "partner_review_comments_isResolved_idx" ON "partner_review_comments"("isResolved");

-- CreateIndex
CREATE INDEX "partner_invitation_logs_email_idx" ON "partner_invitation_logs"("email");

-- CreateIndex
CREATE INDEX "partner_invitation_logs_partnerId_idx" ON "partner_invitation_logs"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "partners_invitationToken_key" ON "partners"("invitationToken");

-- CreateIndex
CREATE INDEX "partners_status_idx" ON "partners"("status");

-- CreateIndex
CREATE INDEX "partners_invitationToken_idx" ON "partners"("invitationToken");

-- CreateIndex
CREATE INDEX "partners_mouExpiryDate_idx" ON "partners"("mouExpiryDate");

-- AddForeignKey
ALTER TABLE "partner_review_comments" ADD CONSTRAINT "partner_review_comments_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
