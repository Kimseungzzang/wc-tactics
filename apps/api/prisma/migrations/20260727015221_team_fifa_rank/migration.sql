/*
  Warnings:

  - Added the required column `fifaRank` to the `Team` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "pot" INTEGER NOT NULL,
    "confederation" TEXT NOT NULL,
    "fifaRank" INTEGER NOT NULL DEFAULT 999
);
INSERT INTO "new_Team" ("confederation", "id", "name", "pot") SELECT "confederation", "id", "name", "pot" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
