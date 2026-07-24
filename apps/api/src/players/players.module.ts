import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { TacticsModule } from '../tactics/tactics.module';

@Module({
  imports: [TacticsModule],
  controllers: [PlayersController],
})
export class PlayersModule {}
