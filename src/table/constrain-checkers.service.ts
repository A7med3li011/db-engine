import { HttpException, Injectable } from '@nestjs/common';
import { Row, TableSchema } from './interfaces/table-schema.interface';

@Injectable()
export class ConstrainCheckerService {
  constructor() {}

  validate(
    row: Row,
    allRows: Row[],
    schema: TableSchema,
    ignoredIndex?: number,
  ): void {
    this.fillDefault(row, schema);
    this.validatePrimaryKey(row, allRows, schema, ignoredIndex);
    this.validateuniqueness(row, allRows, schema, ignoredIndex);
  }

  private validatePrimaryKey(
    row: Row,
    allRows: Row[],
    schema: TableSchema,
    ignoredIndex?: number,
  ): void {
    const primaryKey = schema.columns.find((el) => el.primaryKey)?.name;
    if (!primaryKey) return;
    if (row[primaryKey] == null || row[primaryKey] == undefined)
      throw new HttpException("primary key can't be nullable", 400);

    if (
      allRows.length &&
      allRows.some(
        (el, index) =>
          el[primaryKey] == row[primaryKey] && index != ignoredIndex,
      )
    )
      throw new HttpException(
        `Duplicate primary key "${row[primaryKey] as string}".`,
        409,
      );
  }
  private validateuniqueness(
    row: Row,
    allRows: Row[],
    schema: TableSchema,
    ignoredIndex?: number,
  ): void {
    const uniquenessKeys = schema.columns
      .filter((el) => el.unique)
      .map((ele) => ele.name);
    if (!uniquenessKeys.length) return;

    for (const key of uniquenessKeys) {
      if (
        allRows.some((ele,index) => ele[key] === row[key] && index != ignoredIndex)
      ) {
        throw new HttpException(`key:${key} is duplicated must be unique`, 409);
      }
    }
  }
  private fillDefault(row: Row, schema: TableSchema): void {
    const defaultKeys = schema.columns.filter((el) => el.default != null);

    if (!defaultKeys.length) return;

    for (const key of defaultKeys) {
      if (row[key.name] == null) {
        row[key.name] = key.default;
      }
    }
  }
}
