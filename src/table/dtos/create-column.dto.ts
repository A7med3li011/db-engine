import {
  Allow,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { ColumnType } from '../interfaces/table-schema.interface';

const COLUMN_TYPES: string[] = Object.values(ColumnType);

export class CreateColumnDto {
  @IsString()
  @Length(1, 64)
  name!: string;

  @IsIn(COLUMN_TYPES)
  type!: ColumnType;

  @IsOptional()
  @IsBoolean()
  nullable?: boolean;

  @IsOptional()
  @IsBoolean()
  primaryKey?: boolean;

  @IsOptional()
  @IsBoolean()
  unique?: boolean;

  @IsOptional()
  @IsBoolean()
  indexed?: boolean;

  @Allow()
  default?: any;

  
  @IsOptional()
  @IsInt()
  @Min(1)
  length?: number;
}
