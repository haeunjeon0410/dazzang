-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "deleteRequestedBy" TEXT,
ADD COLUMN     "pauseRequestedBy" TEXT,
ADD COLUMN     "pauseRequestedUntil" TIMESTAMP(3),
ADD COLUMN     "pausedUntil" TIMESTAMP(3);
