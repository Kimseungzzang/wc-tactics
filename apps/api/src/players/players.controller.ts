import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { TacticsToolsService } from '../tactics/tactics-tools.service';

@Controller('players')
export class PlayersController {
  constructor(private readonly tools: TacticsToolsService) {}

  // There's no more tournament-wide "appearances/starts/goals" record to
  // show (no per-match squad selection or real event log left - see
  // TacticsToolsService's doc comments) - just the constructed FIFA-style
  // ratings.
  @Get(':id')
  async get(@Param('id', ParseIntPipe) id: number) {
    const attributesResult = await this.tools.getPlayerAttributes(id);
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

    return {
      playerId: attributesResult.playerId,
      name: attributesResult.name,
      attributes,
    };
  }
}
