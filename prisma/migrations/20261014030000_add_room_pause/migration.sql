-- CreateTable
CREATE TABLE "RoomPause" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "fromWeek" TIMESTAMP(3) NOT NULL,
    "untilWeek" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomPause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomPause_roomId_idx" ON "RoomPause"("roomId");

-- AddForeignKey
ALTER TABLE "RoomPause" ADD CONSTRAINT "RoomPause_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
