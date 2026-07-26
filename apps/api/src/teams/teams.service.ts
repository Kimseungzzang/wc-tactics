import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  // The career team-picker's data source - Match is no longer a shared
  // global catalog to derive the 48 entrants from (every campaign draws
  // its own), so this is the one place that just lists the real teams.
  async list() {
    const teams = await this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return teams;
  }
}
