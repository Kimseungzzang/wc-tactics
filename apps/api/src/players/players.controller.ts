import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { TacticsToolsService } from '../tactics/tactics-tools.service';

@Controller('players')
export class PlayersController {
  constructor(private readonly tools: TacticsToolsService) {}

  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const [attributesResult, stats] = await Promise.all([
      this.tools.getPlayerAttributes(id),
      this.tools.getPlayerStats(id),
    ]);

    const attributes =
      'pace' in attributesResult
        ? {
            pace: attributesResult.pace,
            shooting: attributesResult.shooting,
            passing: attributesResult.passing,
            defending: attributesResult.defending,
            physical: attributesResult.physical,
            stamina: attributesResult.stamina,
          }
        : null;

    return { ...stats, attributes };
  }
}
