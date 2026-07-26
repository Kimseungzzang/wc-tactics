import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { LoginDto } from './dto/login.dto';

@Controller('managers')
export class ManagersController {
  constructor(private readonly service: CampaignsService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.service.login(dto.nickname);
  }

  @Get(':id/campaigns')
  listCampaigns(@Param('id') managerId: string) {
    return this.service.listManagerCampaigns(managerId);
  }
}
