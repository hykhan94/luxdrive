-- AlterTable
ALTER TABLE "driver_review_requests" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "requestType" TEXT NOT NULL DEFAULT 'ADMIN_INITIATED',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "editSnapshot" JSONB;

-- AlterTable
ALTER TABLE "vehicle_review_requests" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "requestType" TEXT NOT NULL DEFAULT 'ADMIN_INITIATED',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "editSnapshot" JSONB;

-- CreateTable
CREATE TABLE "driver_review_comments" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "driver_review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_review_comments" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "vehicle_review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_review_comments_driverId_idx" ON "driver_review_comments"("driverId");

-- CreateIndex
CREATE INDEX "driver_review_comments_isResolved_idx" ON "driver_review_comments"("isResolved");

-- CreateIndex
CREATE INDEX "vehicle_review_comments_vehicleId_idx" ON "vehicle_review_comments"("vehicleId");

-- CreateIndex
CREATE INDEX "vehicle_review_comments_isResolved_idx" ON "vehicle_review_comments"("isResolved");

-- CreateIndex
CREATE INDEX "driver_review_requests_status_idx" ON "driver_review_requests"("status");

-- CreateIndex
CREATE INDEX "driver_review_requests_requestType_idx" ON "driver_review_requests"("requestType");

-- CreateIndex
CREATE INDEX "vehicle_review_requests_status_idx" ON "vehicle_review_requests"("status");

-- CreateIndex
CREATE INDEX "vehicle_review_requests_requestType_idx" ON "vehicle_review_requests"("requestType");

-- AddForeignKey
ALTER TABLE "driver_review_comments" ADD CONSTRAINT "driver_review_comments_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_review_comments" ADD CONSTRAINT "vehicle_review_comments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
