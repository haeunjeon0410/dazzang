-- AlterTable
ALTER TABLE "User" ADD COLUMN     "captions" TEXT[] DEFAULT ARRAY[]::TEXT[];
