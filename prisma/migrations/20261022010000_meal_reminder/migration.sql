-- AlterTable
ALTER TABLE "User" ADD COLUMN "mealReminder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lunchTime" TEXT NOT NULL DEFAULT '12:30',
ADD COLUMN "dinnerTime" TEXT NOT NULL DEFAULT '18:30';

-- CreateTable
CREATE TABLE "MealReminderSent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL,

    CONSTRAINT "MealReminderSent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MealReminderSent_userId_day_kind_key" ON "MealReminderSent"("userId", "day", "kind");
