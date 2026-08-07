import { HttpException, Injectable } from '@nestjs/common';
import { ColumnType, TableSchema } from './interfaces/table-schema.interface';

@Injectable()
export class SchemaValidatoreService {
  validate(schema: TableSchema): void {
    this.validateTableName(schema);
    this.validateColumnsExist(schema);
    this.validateColumnNames(schema);
    this.validateDuplicateColumns(schema);
    this.validateTypes(schema);
  }

  
  private validateTableName(schema: TableSchema): void {
    if (!schema.name.trim())
      throw new HttpException("Table name can't be emtpy", 400);
  }
  private validateColumnsExist(schema: TableSchema): void {
    if (!schema.columns.length)
      throw new HttpException('Table must contain at least one column', 400);
  }

  private validateColumnNames(schema: TableSchema) {
    for (const col of schema.columns) {
      if (!col.name.trim())
        throw new HttpException('Column name cannot be empty', 400);
    }
  }
  private validateDuplicateColumns(schema: TableSchema) {
    const names = new Set<string>();

    for (const column of schema.columns) {
      if (names.has(column.name)) {
        throw new HttpException(`Duplicate column "${column.name}.`, 400);
      }

      names.add(column.name);
    }
  }
  private validateTypes(schema: TableSchema) {
    const allowed = new Set<string>(Object.values(ColumnType));

    for (const column of schema.columns) {
      if (!allowed.has(column.type)) {
        throw new HttpException(
          `Unsupported type "${column.type}". Allowed types: ${[...allowed].join(', ')}.`,
          400,
        );
      }
    }
  }
}
