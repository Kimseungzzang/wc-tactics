import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MatchesModule } from './matches/matches.module';
import { PositionsModule } from './positions/positions.module';
import { TacticsModule } from './tactics/tactics.module';

@Module({
  imports: [PrismaModule, MatchesModule, PositionsModule, TacticsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
