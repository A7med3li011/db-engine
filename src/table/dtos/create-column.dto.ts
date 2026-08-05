import {
  Allow,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import type { ColumnType } from '../interfaces/table-schema.interface';

const COLUMN_TYPES: ColumnType[] = ['number', 'string', 'boolean'];

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
}
