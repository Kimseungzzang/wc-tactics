-- CreateTable
CREATE TABLE "PlayerAttributes" (
    "playerId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pace" INTEGER NOT NULL,
    "shooting" INTEGER NOT NULL,
    "passing" INTEGER NOT NULL,
    "defending" INTEGER NOT NULL,
    "physical" INTEGER NOT NULL,
    "stamina" INTEGER NOT NULL,
    CONSTRAINT "PlayerAttributes_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamTacticalProfile" (
    "teamId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pressingIntensity" INTEGER NOT NULL,
    "possessionStyle" INTEGER NOT NULL,
    "defensiveLine" INTEGER NOT NULL,
    CONSTRAINT "TeamTacticalProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
