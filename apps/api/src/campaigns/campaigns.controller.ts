import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { RecordResultDto } from './dto/record-result.dto';
import { SubmitLineupDto } from './dto/submit-lineup.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.service.createCampaign(dto.managerId, dto.teamId);
  }

  @Get('rankings/:teamId')
  getTeamRankings(@Param('teamId', ParseIntPipe) teamId: number) {
    return this.service.getTeamRankings(teamId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getCampaign(id);
  }

  @Get(':id/draw')
  getDraw(@Param('id') id: string) {
    return this.service.getFullDraw(id);
  }

  @Get(':id/standings')
  getAllStandings(@Param('id') id: string) {
    return this.service.getAllGroupStandings(id);
  }

  @Get(':id/schedule')
  getSchedule(@Param('id') id: string) {
    return this.service.getSchedule(id);
  }

  @Get(':id/bracket')
  getBracket(@Param('id') id: string) {
    return this.service.getKnockoutBracket(id);
  }

  @Get(':id/previous-lineup')
  getPreviousLineup(@Param('id') id: string) {
    return this.service.getPreviousLineup(id);
  }

  @Post(':id/results')
  recordResult(@Param('id') id: string, @Body() dto: RecordResultDto) {
    return this.service.recordResult(id, dto);
  }

  @Post(':id/lineup')
  submitLineup(@Param('id') id: string, @Body() dto: SubmitLineupDto) {
    return this.service.submitLineup(id, dto);
  }

  @Post(':id/simulate-rest')
  simulateRest(@Param('id') id: string) {
    return this.service.simulateRestOfTournament(id);
  }
}
