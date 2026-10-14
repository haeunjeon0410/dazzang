-- CreateTable
CREATE TABLE "UserRest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromWeek" TIMESTAMP(3) NOT NULL,
    "untilWeek" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserRest_userId_idx" ON "UserRest"("userId");

-- AddForeignKey
ALTER TABLE "UserRest" ADD CONSTRAINT "UserRest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존에 User.restFrom/restUntil로 저장돼 있던 기간을 이력 테이블로 옮긴다
INSERT INTO "UserRest" ("id", "userId", "fromWeek", "untilWeek")
SELECT 'ur_' || "id", "id", "restFrom", "restUntil"
FROM "User"
WHERE "restFrom" IS NOT NULL AND "restUntil" IS NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "restFrom",
DROP COLUMN "restUntil";
