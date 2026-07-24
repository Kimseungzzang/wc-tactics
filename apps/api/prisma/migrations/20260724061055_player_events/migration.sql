-- CreateTable
CREATE TABLE "MatchPlayerEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "t" REAL NOT NULL,
    "endT" REAL NOT NULL,
    "fromX" REAL NOT NULL,
    "fromY" REAL NOT NULL,
    "toX" REAL NOT NULL,
    "toY" REAL NOT NULL,
    "triggerBallEventId" TEXT,
    CONSTRAINT "MatchPlayerEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MatchPlayerEvent_matchId_playerId_t_idx" ON "MatchPlayerEvent"("matchId", "playerId", "t");
