import { HttpException, Injectable } from '@nestjs/common';
import { Row, TableSchema } from './interfaces/table-schema.interface';
import { RowValidatoreService } from './row-validator.service';
import { ConstrainCheckerService } from './constrain-checkers.service';

@Injectable()
export class ValidationService {
  constructor(
    private readonly rowValidatoreService: RowValidatoreService,
    private readonly constrainCheckerService: ConstrainCheckerService,
  ) {}

  async validateRow(
    row: Row,
    schema: TableSchema,
    loadRows: () => Promise<Row[]>,
    ignoredIndex?: number,
  ): Promise<void> {
    this.constrainCheckerService.applyDefaults(row, schema);
    this.rowValidatoreService.validate(row, schema);
    this.validateAutoIncrement(row, schema);
    if (!this.needsAllRows(schema)) return;

    const allRows = await loadRows();
    this.constrainCheckerService.validate(row, allRows, schema, ignoredIndex);
  }

  validateAutoIncrement(row: Row, schema: TableSchema): void {
    for (const column of schema.columns) {
      console.log(column, column.autoIncrement, 'cnncncncncn');
      if (!column.autoIncrement) continue;

      if (column.name in row) {
        throw new HttpException(
          `Column "${column.name}" is auto increment, its value cannot be provided.`,
          400,
        );
      }
    }
  }

  needsAllRows(schema: TableSchema): boolean {
    return schema.columns.some((column) => column.primaryKey || column.unique);
  }

  areEquality(objA: Row, objB: Row): boolean {
    const keysObjA = Object.keys(objA);
    const keysObjB = Object.keys(objB);
    if (keysObjA.length != keysObjB.length) return false;

    for (const key of keysObjA) {
      if (objA[key] != objB[key]) {
        return false;
      }
    }

    return true;
  }
}
