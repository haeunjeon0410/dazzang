-- AlterTable
ALTER TABLE "Meal" ADD COLUMN "fraction" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "confirmed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'app';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "mealToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_mealToken_key" ON "User"("mealToken");
