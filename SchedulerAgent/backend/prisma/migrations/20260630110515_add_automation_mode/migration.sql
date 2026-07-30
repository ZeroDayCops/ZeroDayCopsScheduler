-- CreateEnum
CREATE TYPE "AutomationMode" AS ENUM ('MANUAL', 'AUTO_SCHEDULE', 'AUTO_PUBLISH');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "automationMode" "AutomationMode" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "defaultSlotTime" TEXT NOT NULL DEFAULT '10:00';
