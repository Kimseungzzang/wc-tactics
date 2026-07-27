-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MatchSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "second" INTEGER NOT NULL,
    "formation" TEXT NOT NULL,
    "lineup" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchSnapshot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MatchSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_MatchSnapshot" ("formation", "id", "lineup", "matchId", "minute", "second", "teamId") SELECT "formation", "id", "lineup", "matchId", "minute", "second", "teamId" FROM "MatchSnapshot";
DROP TABLE "MatchSnapshot";
ALTER TABLE "new_MatchSnapshot" RENAME TO "MatchSnapshot";
CREATE INDEX "MatchSnapshot_matchId_teamId_minute_second_idx" ON "MatchSnapshot"("matchId", "teamId", "minute", "second");
CREATE TABLE "new_Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "pot" INTEGER NOT NULL,
    "confederation" TEXT NOT NULL,
    "fifaRank" INTEGER NOT NULL
);
INSERT INTO "new_Team" ("confederation", "fifaRank", "id", "name", "pot") SELECT "confederation", "fifaRank", "id", "name", "pot" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
