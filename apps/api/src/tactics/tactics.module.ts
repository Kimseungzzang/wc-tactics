import { Module } from '@nestjs/common';
import { TacticsController } from './tactics.controller';
import { TacticsService } from './tactics.service';
import { WhatIfService } from './what-if.service';
import { GeminiService } from './gemini.service';
import { TacticsToolsService } from './tactics-tools.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TacticsController],
  providers: [TacticsService, WhatIfService, GeminiService, TacticsToolsService],
})
export class TacticsModule {}
