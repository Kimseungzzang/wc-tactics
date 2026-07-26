import { IsInt, IsString } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  managerId: string;

  @IsInt()
  teamId: number;
}
