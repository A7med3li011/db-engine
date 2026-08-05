import { IsNotEmptyObject, IsObject, IsString, Length } from 'class-validator';
import type { Row } from '../interfaces/table-schema.interface';

export class InsertRowDto {
  @IsString()
  @Length(1, 64)
  tableName!: string;

  @IsObject()
  @IsNotEmptyObject()
  row!: Row;
}
