import { HttpException, Injectable } from '@nestjs/common';
import { SchemaValidatoreService } from './schema-validator.service';
import {
  Row,
  TableSchema,
  WhereClause,
} from './interfaces/table-schema.interface';
import { RowValidatoreService } from './row-validator.service';
import { StorageEngineService } from 'src/storage-engine/storage-engine.service';
import { StoredRow } from 'src/storage-engine/csv/stored-row-interface';
import { ConstrainCheckerService } from './constrain-checkers.service';

@Injectable()
export class TableService {
  constructor(
    private readonly SchemaValidatoreService: SchemaValidatoreService,
    private readonly storageEngineService: StorageEngineService,
    private readonly RowValidatoreService: RowValidatoreService,
    private readonly ConstrainCheckerService: ConstrainCheckerService,
  ) {}

  async create(dto: TableSchema): Promise<void> {
    this.SchemaValidatoreService.validate(dto);

    await this.storageEngineService.createTable(dto);
  }

  async insert(
    tableName: string,
    columns: string[],
    values: string[],
  ): Promise<void> {
    const schema = await this.storageEngineService.readSchema(tableName);
    const allRows = await this.storageEngineService.readAllRows(tableName);
    const row = {};
    columns.forEach((el, index) => {
      row[el] = values[index];
    });
    this.ConstrainCheckerService.validate(row, allRows, schema);
    this.RowValidatoreService.validate(row, schema);

    await this.storageEngineService.insertRow(tableName, row);
  }

  async select(
    tableName: string,
    projection: string[] | undefined,
    where: WhereClause | undefined,
  ): Promise<Row[]> {
    const rows = await this.storageEngineService.select(
      tableName,
      projection,
      where,
    );

    return rows;
  }

  async update(
    tableName: string,
    where: WhereClause | null | undefined,
    updates: Record<string, unknown>,
  ): Promise<void> {
    if (Object.keys(updates).length === 0) {
      throw new HttpException('There are no values for updates', 400);
    }

    if (!where || Object.keys(where).length === 0) {
      throw new HttpException('There are no conditions for update', 400);
    }

    const schema = await this.storageEngineService.readSchema(tableName);
    const storedRows = await this.storageEngineService.readAllRows(
      tableName,
      true,
    );

    const targets: StoredRow[] = [];
    const changedIndexes: number[] = [];

    storedRows.forEach((entry, index) => {
      if (this.rowChecker(entry.row, where)) {
        targets.push(entry);
        changedIndexes.push(index);
      }
    });

    if (targets.length === 0) {
      throw new HttpException('There are no matched rows for update', 404);
    }

    const projected: Row[] = storedRows.map((entry) => entry.row);

    for (const index of changedIndexes) {
      projected[index] = { ...projected[index], ...updates };
    }

    for (const index of changedIndexes) {
      this.ConstrainCheckerService.validate(
        projected[index],
        projected,
        schema,
        index,
      );
      this.RowValidatoreService.validate(projected[index], schema);
    }

    // Nothing is written until every merged row has passed validation.
    await this.storageEngineService.applyUpdate(
      tableName,
      targets,
      changedIndexes.map((index) => projected[index]),
    );
  }
  async delete(tableName: string, where: WhereClause | null): Promise<void> {
    await this.storageEngineService.deleteRow(tableName, where);
  }

  async drop(tableName: string | undefined): Promise<void> {
    if (!tableName) throw new HttpException('table name is required', 400);
    await this.storageEngineService.dropTable(tableName);
  }

  private rowChecker(row: Row, where: WhereClause): boolean {
    const { column, operator, value } = where;

    switch (operator) {
      case '>':
        return Number(row[column]) > Number(value);

      case '<':
        return Number(row[column]) < Number(value);
      case '>=':
        return Number(row[column]) >= Number(value);
      case '<=':
        return Number(row[column]) <= Number(value);

      case '=':
        return row[column] == value;
      case '<>':
      case '!=':
        return row[column] != value;
      default:
        throw new HttpException(`Unsupported operator "${operator}"`, 400);
    }
  }
}
