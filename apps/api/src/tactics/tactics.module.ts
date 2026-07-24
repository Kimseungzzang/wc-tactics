import { Module } from '@nestjs/common';
import { TacticsController } from './tactics.controller';
import { TacticsService } from './tactics.service';
import { GeminiService } from './gemini.service';
import { TacticsToolsService } from './tactics-tools.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TacticsController],
  providers: [TacticsService, GeminiService, TacticsToolsService],
})
export class TacticsModule {}
