import { Module } from '@nestjs/common';
import { PositionsController } from './positions.controller';

@Module({
  controllers: [PositionsController],
})
export class PositionsModule {}
