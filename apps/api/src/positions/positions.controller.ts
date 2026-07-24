import { Controller, Get } from '@nestjs/common';
import { POSITION_COORDINATES } from './position-coordinates';

@Controller('positions')
export class PositionsController {
  @Get()
  list() {
    return POSITION_COORDINATES;
  }
}
