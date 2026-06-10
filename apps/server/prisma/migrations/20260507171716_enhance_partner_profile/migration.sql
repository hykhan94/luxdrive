/*
  Warnings:

  - A unique constraint covering the columns `[invitationToken]` on the table `partner_team_members` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `partner_team_members` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "partner_team_members" ADD COLUMN     "invitationAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "invitationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "invitationSentAt" TIMESTAMP(3),
ADD COLUMN     "invitationToken" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'INVITED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "partners" ADD COLUMN     "baladyNumber" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankIban" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "chamberOfCommerceNumber" TEXT,
ADD COLUMN     "nationalAddress" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "partner_team_members_invitationToken_key" ON "partner_team_members"("invitationToken");

-- AddForeignKey
ALTER TABLE "partner_team_members" ADD CONSTRAINT "partner_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
