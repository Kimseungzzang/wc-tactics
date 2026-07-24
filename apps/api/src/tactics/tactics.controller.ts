import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { TacticsService } from './tactics.service';
import { WhatIfService } from './what-if.service';
import { RecommendTacticsDto } from './dto/recommend-tactics.dto';

@Controller('matches/:id/tactics')
export class TacticsController {
  constructor(
    private readonly service: TacticsService,
    private readonly whatIf: WhatIfService,
  ) {}

  @Post('recommend')
  recommend(
    @Param('id', ParseIntPipe) matchId: number,
    @Body() dto: RecommendTacticsDto,
  ) {
    return this.service.recommend(matchId, dto);
  }

  @Post('what-if')
  whatIfScenario(
    @Param('id', ParseIntPipe) matchId: number,
    @Body() dto: RecommendTacticsDto,
  ) {
    return this.whatIf.generate(matchId, dto);
  }
}
