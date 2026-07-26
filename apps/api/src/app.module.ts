import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MatchesModule } from './matches/matches.module';
import { PositionsModule } from './positions/positions.module';
import { TacticsModule } from './tactics/tactics.module';
import { PlayersModule } from './players/players.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [
    PrismaModule,
    MatchesModule,
    PositionsModule,
    TacticsModule,
    PlayersModule,
    CampaignsModule,
    TeamsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
