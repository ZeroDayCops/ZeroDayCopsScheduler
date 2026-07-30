-- CreateEnum
CREATE TYPE "LogEvent" AS ENUM ('ATTEMPT', 'SUCCESS', 'FAILURE', 'RETRY');

-- CreateTable
CREATE TABLE "PostLog" (
    "id" TEXT NOT NULL,
    "scheduledPostId" TEXT NOT NULL,
    "event" "LogEvent" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PostLog" ADD CONSTRAINT "PostLog_scheduledPostId_fkey" FOREIGN KEY ("scheduledPostId") REFERENCES "ScheduledPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
