import { IsInt, IsOptional, Min } from 'class-validator';

export class RecordResultDto {
  @IsInt()
  matchId: number;

  @IsInt()
  @Min(0)
  homeScore: number;

  @IsInt()
  @Min(0)
  awayScore: number;

  /** Only meaningful when homeScore === awayScore in a knockout stage -
   * the real shootout tally from the frontend's interactive PenaltyShootout
   * flow, used instead of a silent coin-flip tiebreak. */
  @IsOptional()
  @IsInt()
  @Min(0)
  shootoutHomeScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  shootoutAwayScore?: number;
}
