import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { ManagersController } from './managers.controller';
import { CampaignsService } from './campaigns.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CampaignsController, ManagersController],
  providers: [CampaignsService],
})
export class CampaignsModule {}
