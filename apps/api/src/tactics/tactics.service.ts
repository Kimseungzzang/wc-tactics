import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from './gemini.service';
import { RecommendTacticsDto } from './dto/recommend-tactics.dto';

@Injectable()
export class TacticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  async recommend(matchId: number, dto: RecommendTacticsDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) throw new NotFoundException(`Match not found: id=${matchId}`);

    const opponentTeamId =
      dto.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

    return this.gemini.recommend(matchId, opponentTeamId, dto);
  }
}
