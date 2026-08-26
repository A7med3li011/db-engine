import { HttpException, Injectable } from '@nestjs/common';
import {
  ColumnDefinition,
  ColumnType,
  Row,
  TableSchema,
} from './interfaces/table-schema.interface';

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
        if (column.default != null || column.autoIncrement) {
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
  private validateColumnType(column: ColumnDefinition, value: unknown): void {
    if (column.autoIncrement) return;
    switch (column.type) {
      case ColumnType.INTEGER:
        if (!Number.isInteger(value)) {
          throw new HttpException(
            `Column "${column.name}" must be an INTEGER.`,
            400,
          );
        }
        break;

      case ColumnType.BOOLEAN:
        if (typeof value !== 'boolean') {
          throw new HttpException(
            `Column "${column.name}" must be a BOOLEAN.`,
            400,
          );
        }
        break;

      case ColumnType.VARCHAR:
        if (typeof value !== 'string') {
          throw new HttpException(
            `Column "${column.name}" must be a VARCHAR.`,
            400,
          );
        }

        if (column.length && value.length > column.length) {
          throw new HttpException(
            `Column "${column.name}" exceeds VARCHAR(${column.length}).`,
            400,
          );
        }

        break;

      case ColumnType.TEXT:
        if (typeof value !== 'string') {
          throw new HttpException(`Column "${column.name}" must be TEXT.`, 400);
        }

        break;

      case ColumnType.TIMESTAMP:
        if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
          throw new HttpException(
            `Column "${column.name}" must be a valid TIMESTAMP.`,
            400,
          );
        }

        break;
    }
  }

  private validateTypes(row: Row, schema: TableSchema): void {
    for (const column of schema.columns) {
      this.validateColumnType(column, row[column.name]);
    }
  }
}
