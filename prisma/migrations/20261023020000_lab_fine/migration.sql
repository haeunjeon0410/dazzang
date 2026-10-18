-- CreateTable
CREATE TABLE "LabFineRule" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "sinceWeek" TIMESTAMP(3),
    "proposedAmount" INTEGER,
    "proposedBy" TEXT,

    CONSTRAINT "LabFineRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LabFineRule_roomId_feature_key" ON "LabFineRule"("roomId", "feature");

-- AddForeignKey
ALTER TABLE "LabFineRule" ADD CONSTRAINT "LabFineRule_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
