import {
  Body,
  Controller,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TacticsService } from './tactics.service';
import { WhatIfService } from './what-if.service';
import { RecommendTacticsDto } from './dto/recommend-tactics.dto';

@Controller('matches/:id/tactics')
export class TacticsController {
  private readonly logger = new Logger(TacticsController.name);

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

  // Streams newline-delimited JSON chunks as the AI generates each ~8 minute
  // segment, instead of blocking until the whole rest-of-match scenario is
  // ready - lets the frontend start playback on the first chunk immediately
  // and avoids building one huge response payload.
  @Post('what-if')
  async whatIfScenario(
    @Param('id', ParseIntPipe) matchId: number,
    @Body() dto: RecommendTacticsDto,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    try {
      for await (const chunk of this.whatIf.generateStream(matchId, dto)) {
        res.write(`${JSON.stringify(chunk)}\n`);
      }
    } catch (err) {
      this.logger.error(`what-if stream failed: ${String(err)}`);
      res.write(`${JSON.stringify({ error: String(err), done: true })}\n`);
    } finally {
      res.end();
    }
  }
}
