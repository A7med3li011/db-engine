import { HttpException, Injectable } from '@nestjs/common';
import { SchemaValidatoreService } from './schema-validator.service';
import {
  Row,
  SerialCounter,
  TableSchema,
  WhereClause,
} from './interfaces/table-schema.interface';
import { StorageEngineService } from 'src/storage-engine/storage-engine.service';
import { StoredRow } from 'src/storage-engine/csv/stored-row-interface';
import { ValidationService } from './validation.service';
import { LockService } from 'src/shared/lock.service';
@Injectable()
export class TableService {
  constructor(
    private readonly SchemaValidatoreService: SchemaValidatoreService,
    private readonly storageEngineService: StorageEngineService,
    private readonly validateService: ValidationService,
    private readonly lockService: LockService,
  ) {}

  private getLockKey(tableName: string) {
    return `${tableName}`;
  }
  async create(dto: TableSchema): Promise<void> {
    return this.lockService.runExclusive(
      this.getLockKey(dto.name),
      async () => {
        this.SchemaValidatoreService.validate(dto);
        await this.storageEngineService.createTable(dto);
      },
    );
  }

  async insert(
    tableName: string,
    columns: string[],
    values: string[],
  ): Promise<void> {
    return this.lockService.runExclusive(
      this.getLockKey(tableName),
      async () => {
        const schema = await this.storageEngineService.readSchema(tableName);
        const incrementalCols = schema.columns.filter((el) => el.autoIncrement);
        const row = {};
        columns.forEach((el, index) => {
          row[el] = values[index];
        });

        const readAllRows = async () => {
          const storedRows =
            await this.storageEngineService.readAllRows(tableName);
          return storedRows;
        };
        await this.validateService.validateRow(row, schema, readAllRows);

        if (incrementalCols.length) {
          const incrementalbase =
            await this.storageEngineService.retrieveSerails(tableName);
          const updatedIncrementalfile: SerialCounter[] = [];
          incrementalbase.forEach((el) => {
            row[el.column] = Number(el.latest_value) + 1;
            el.latest_value += 1;
            updatedIncrementalfile.push(el);
          });
          await this.storageEngineService.incrementCurrentSerail(
            tableName,
            updatedIncrementalfile,
          );
        }

        await this.storageEngineService.insertRow(tableName, row);
      },
    );
  }

  async select(
    tableName: string,
    projection: string[] | undefined,
    where: WhereClause | undefined,
  ): Promise<Row[]> {
    return this.lockService.runExclusive(tableName, async () => {
      const rows = await this.storageEngineService.select(
        tableName,
        projection,
        where,
      );

      return rows;
    });
  }

  async update(
    tableName: string,
    where: WhereClause | null | undefined,
    updates: Record<string, unknown>,
  ): Promise<void> {
    return this.lockService.runExclusive(tableName, async () => {
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

      const colswithAutoIncremental = schema.columns
        .filter((el) => el.autoIncrement)
        .map((el) => el.name);

      if (colswithAutoIncremental.length) {
        colswithAutoIncremental.forEach((el) => {
          if (updates[el] || updates[el] == 0 || updates[el] === null) {
            throw new HttpException(
              `you can not update ${el} it's a serial column`,
              400,
            );
          }
        });
      }
      const targets: StoredRow[] = [];
      const changedIndexes: number[] = [];
      const projected: Row[] = storedRows.map((entry) => entry.row);
      let matched = 0;

      storedRows.forEach((entry, index) => {
        if (!this.rowChecker(entry.row, where)) return;
        matched++;

        const updatedRow = { ...entry.row, ...updates };
        if (this.validateService.areEquality(entry.row, updatedRow)) return;

        projected[index] = updatedRow;
        targets.push(entry);
        changedIndexes.push(index);
      });

      if (matched === 0) {
        throw new HttpException('There are no matched rows for update', 404);
      }

      if (changedIndexes.length === 0) return;

      const loadRows = () => Promise.resolve(projected);

      for (const index of changedIndexes) {
        const abstractedProjected = { ...projected[index] };
        await this.validateService.validateRow(
          colswithAutoIncremental.length
            ? this.abstractionFromAutoIncrementalKeys(
                abstractedProjected,
                colswithAutoIncremental,
              )
            : projected[index],
          schema,
          loadRows,
          index,
        );
      }

      await this.storageEngineService.applyUpdate(
        tableName,
        targets,
        changedIndexes.map((index) => projected[index]),
      );
    });
  }
  async delete(tableName: string, where: WhereClause | null): Promise<void> {
    return this.lockService.runExclusive(tableName, async () => {
      await this.storageEngineService.deleteRow(tableName, where);
    });
  }

  async drop(tableName: string | undefined): Promise<void> {
    if (!tableName) throw new HttpException('table name is required', 400);
    return this.lockService.runExclusive(tableName, async () => {
      await this.storageEngineService.dropTable(tableName);
    });
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
  private abstractionFromAutoIncrementalKeys(obj: Row, cols: string[]) {
    cols.forEach((el) => delete obj[el]);
    return obj;
  }
}
