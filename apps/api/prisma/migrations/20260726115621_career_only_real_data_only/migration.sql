/*
  Warnings:

  - You are about to drop the `CampaignMatchResult` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MatchEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MatchFrame` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MatchPlayerEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `MatchSquad` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `awayManagerName` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `homeManagerName` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `isMock` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `kickOff` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `matchDate` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `refereeName` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `stadiumName` on the `Match` table. All the data in the column will be lost.
  - Added the required column `campaignId` to the `Match` table without a default value. This is not possible if the table is not empty.
  - Made the column `competitionStage` on table `Match` required. This step will fail if there are existing NULL values in that column.
  - Made the column `matchWeek` on table `Match` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `jerseyNumber` to the `Player` table without a default value. This is not possible if the table is not empty.
  - Added the required column `position` to the `Player` table without a default value. This is not possible if the table is not empty.
  - Added the required column `teamId` to the `Player` table without a default value. This is not possible if the table is not empty.
  - Added the required column `confederation` to the `Team` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pot` to the `Team` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "CampaignMatchResult_campaignId_matchId_key";

-- DropIndex
DROP INDEX "MatchEvent_matchId_minute_second_idx";

-- DropIndex
DROP INDEX "MatchFrame_matchId_t_idx";

-- DropIndex
DROP INDEX "MatchPlayerEvent_matchId_playerId_t_idx";

-- DropIndex
DROP INDEX "MatchSquad_matchId_playerId_key";

-- DropIndex
DROP INDEX "MatchSquad_matchId_teamId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CampaignMatchResult";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MatchEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MatchFrame";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MatchPlayerEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "MatchSquad";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Match" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaignId" TEXT NOT NULL,
    "competitionStage" TEXT NOT NULL,
    "matchWeek" INTEGER NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "played" BOOLEAN NOT NULL DEFAULT false,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Match_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("awayScore", "awayTeamId", "competitionStage", "homeScore", "homeTeamId", "id", "matchWeek") SELECT "awayScore", "awayTeamId", "competitionStage", "homeScore", "homeTeamId", "id", "matchWeek" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_campaignId_competitionStage_idx" ON "Match"("campaignId", "competitionStage");
CREATE TABLE "new_Player" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "jerseyNumber" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Player" ("id", "name") SELECT "id", "name" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE TABLE "new_Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "pot" INTEGER NOT NULL,
    "confederation" TEXT NOT NULL
);
INSERT INTO "new_Team" ("id", "name") SELECT "id", "name" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
