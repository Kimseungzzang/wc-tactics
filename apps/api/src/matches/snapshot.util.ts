import { PrismaService } from '../prisma/prisma.service';

export interface SnapshotPlayer {
  playerId: number;
  name: string;
  jerseyNumber: number;
  positionId: number;
  positionName: string;
}

export interface TeamSnapshot {
  formation: string;
  lineup: SnapshotPlayer[];
}

export async function getTeamSnapshotAtMinute(
  prisma: PrismaService,
  matchId: number,
  teamId: number,
  minute: number,
): Promise<TeamSnapshot | null> {
  const row = await prisma.matchSnapshot.findFirst({
    where: { matchId, teamId, minute: { lte: minute } },
    orderBy: [{ minute: 'desc' }, { second: 'desc' }],
  });
  if (!row) return null;
  return {
    formation: row.formation,
    lineup: JSON.parse(row.lineup) as SnapshotPlayer[],
  };
}
