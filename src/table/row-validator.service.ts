import { HttpException, Injectable } from '@nestjs/common';
import { Row, TableSchema } from './interfaces/table-schema.interface';

@Injectable()
export class RowValidatoreService {
  constructor() {}

  validate(row: Row, schema: TableSchema): void {
    this.validateRequiredColumns(row, schema);
    this.validateUnknownColumns(row, schema);
    this.validateTypes(row, schema);
  }

  private validateRequiredColumns(row: Row, schema: TableSchema): void {
    for (const column of schema.columns) {
      if (!(column.name in row)) {
        if (column.default != null) {
          continue;
        }
        throw new HttpException(`Missing column "${column.name}".`, 400);
      }
    }
  }
  private validateUnknownColumns(row: Row, schema: TableSchema): void {
    const allowedColumns = new Set(schema.columns.map((c) => c.name));

    for (const key of Object.keys(row)) {
      if (!allowedColumns.has(key)) {
        throw new HttpException(`Unknown column "${key}".`, 400);
      }
    }
  }

  private validateTypes(row: Row, schema: TableSchema): void {
    for (const column of schema.columns) {
      const value = row[column.name];

      if (typeof value !== column.type) {
        console.log(typeof value, column.type);
        throw new HttpException(
          `Column "${column.name}" must be of type "${column.type}".`,
          400,
        );
      }
    }
  }
}
