-- CreateEnum
CREATE TYPE "UploadBatchStatus" AS ENUM ('UPLOADING', 'ANALYZING', 'READY', 'COMMITTED', 'PARTIALLY_FAILED');

-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "Media" ADD COLUMN "batchId" TEXT,
ADD COLUMN "sequenceIndex" INTEGER;

-- AlterTable
ALTER TABLE "ScheduledPost" ADD COLUMN "batchId" TEXT;

-- CreateTable
CREATE TABLE "UploadBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "UploadBatchStatus" NOT NULL DEFAULT 'UPLOADING',
    "scheduleConfig" JSONB,
    "publishModeOverride" "AutomationMode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UploadBatch_workspaceId_createdAt_idx" ON "UploadBatch"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Media_batchId_idx" ON "Media"("batchId");

-- CreateIndex
CREATE INDEX "ScheduledPost_batchId_idx" ON "ScheduledPost"("batchId");

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadBatch" ADD CONSTRAINT "UploadBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "UploadBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
