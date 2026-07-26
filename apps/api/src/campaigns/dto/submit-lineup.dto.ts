import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
} from 'class-validator';

export class SubmitLineupDto {
  @IsInt()
  matchId: number;

  @IsString()
  formation: string;

  @IsInt()
  goalkeeperPlayerId: number;

  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  outfieldPlayerIds: number[];
}
