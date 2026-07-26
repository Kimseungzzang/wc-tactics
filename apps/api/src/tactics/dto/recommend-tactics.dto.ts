import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProposedSubstitutionDto {
  @IsInt()
  outPlayerId: number;

  @IsInt()
  inPlayerId: number;
}

export class TacticalDialDto {
  @IsInt()
  @Min(0)
  @Max(100)
  pressingIntensity: number;

  @IsInt()
  @Min(0)
  @Max(100)
  possessionStyle: number;

  @IsInt()
  @Min(0)
  @Max(100)
  defensiveLine: number;
}

export class ProposedChangeDto {
  @IsOptional()
  @IsString()
  formation?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposedSubstitutionDto)
  substitutions?: ProposedSubstitutionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TacticalDialDto)
  tacticalDial?: TacticalDialDto;
}

export class RecommendTacticsDto {
  @IsInt()
  @Min(0)
  minute: number;

  @IsInt()
  teamId: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProposedChangeDto)
  proposedChange?: ProposedChangeDto;
}
