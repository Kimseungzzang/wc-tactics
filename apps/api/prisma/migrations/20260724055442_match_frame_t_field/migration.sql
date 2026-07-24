/*
  Warnings:

  - Added the required column `t` to the `MatchFrame` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MatchFrame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" INTEGER NOT NULL,
    "t" REAL NOT NULL,
    "period" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "second" INTEGER NOT NULL,
    "ballX" REAL NOT NULL,
    "ballY" REAL NOT NULL,
    "players" TEXT NOT NULL,
    CONSTRAINT "MatchFrame_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MatchFrame" ("ballX", "ballY", "id", "matchId", "minute", "period", "players", "second") SELECT "ballX", "ballY", "id", "matchId", "minute", "period", "players", "second" FROM "MatchFrame";
DROP TABLE "MatchFrame";
ALTER TABLE "new_MatchFrame" RENAME TO "MatchFrame";
CREATE INDEX "MatchFrame_matchId_t_idx" ON "MatchFrame"("matchId", "t");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
