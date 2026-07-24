import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ProposedSubstitutionDto {
  @IsInt()
  outPlayerId: number;

  @IsInt()
  inPlayerId: number;
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
