-- CreateTable
CREATE TABLE "Ribbon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "usedWeek" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ribbon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ribbon_userId_idx" ON "Ribbon"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Ribbon_userId_weekStart_key" ON "Ribbon"("userId", "weekStart");

-- AddForeignKey
ALTER TABLE "Ribbon" ADD CONSTRAINT "Ribbon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
