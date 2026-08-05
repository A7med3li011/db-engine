import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { CreateColumnDto } from './create-column.dto';

export class CreateTableDto {
  @IsString()
  @Length(1, 64)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateColumnDto)
  columns!: CreateColumnDto[];
}
