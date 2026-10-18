-- AlterTable
ALTER TABLE "User" ADD COLUMN "labWeight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "weightAge" INTEGER,
ADD COLUMN "weightHeight" DOUBLE PRECISION,
ADD COLUMN "weightSetup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "labDismissed" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "WeightLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "kg" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeightLog_userId_weekStart_key" ON "WeightLog"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "WeightLog" ADD CONSTRAINT "WeightLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
