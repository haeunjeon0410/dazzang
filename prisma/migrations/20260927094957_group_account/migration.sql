/*
  Warnings:

  - You are about to drop the column `accountHolder` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `accountNumber` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `bankName` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Room" ADD COLUMN "groupAccountHolder" TEXT;
ALTER TABLE "Room" ADD COLUMN "groupAccountNumber" TEXT;
ALTER TABLE "Room" ADD COLUMN "groupBankName" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "id", "name", "roomId") SELECT "createdAt", "id", "name", "roomId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
