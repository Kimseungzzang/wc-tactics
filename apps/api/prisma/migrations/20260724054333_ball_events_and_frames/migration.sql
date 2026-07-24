-- CreateTable
CREATE TABLE "MatchBallEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "second" INTEGER NOT NULL,
    "duration" REAL NOT NULL,
    "playerId" INTEGER,
    "playerName" TEXT,
    "recipientId" INTEGER,
    "recipientName" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "endX" REAL,
    "endY" REAL,
    "outcome" TEXT,
    CONSTRAINT "MatchBallEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchFrame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL,
    "second" INTEGER NOT NULL,
    "ballX" REAL NOT NULL,
    "ballY" REAL NOT NULL,
    "players" TEXT NOT NULL,
    CONSTRAINT "MatchFrame_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MatchBallEvent_matchId_minute_second_idx" ON "MatchBallEvent"("matchId", "minute", "second");

-- CreateIndex
CREATE INDEX "MatchFrame_matchId_minute_second_idx" ON "MatchFrame"("matchId", "minute", "second");
