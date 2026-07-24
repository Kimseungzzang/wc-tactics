import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly service: MatchesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Get(':id/snapshot')
  snapshot(
    @Param('id', ParseIntPipe) id: number,
    @Query('minute', new DefaultValuePipe(0), ParseIntPipe) minute: number,
  ) {
    return this.service.snapshotAtMinute(id, minute);
  }

  @Get(':id/frames')
  frames(@Param('id', ParseIntPipe) id: number) {
    return this.service.frames(id);
  }
}
