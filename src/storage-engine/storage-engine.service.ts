import { HttpException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PathService } from 'src/shared/path.service';
import { StorageService } from 'src/storage/storage.service';
import {
  Row,
  TableSchema,
  WhereClause,
} from 'src/table/interfaces/table-schema.interface';
import {
  DELIMITER,
  FLAG_WIDTH,
  LINE_BREAK,
  LIVE_FLAG,
  WASTED_FLAG,
} from './csv/csv-constants';
import {
  decodeRow,
  splitFields,
  encodeRow,
  encodeHeader,
} from './csv/csv-codec';
import { StoredRow } from './csv/stored-row-interface';

@Injectable()
export class StorageEngineService {
  constructor(
    private readonly pathService: PathService,
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  async readSchema(tableName: string): Promise<TableSchema> {
    const db = this.databaseService.requireCurrentDatabase();
    const schemaPath = this.pathService.getSchemaPath(db, tableName);

    if (!(await this.storageService.exists(schemaPath))) {
      throw new HttpException(`Schema ${tableName} does not exist`, 404);
    }

    const content = await this.storageService.readFile({ path: schemaPath });

    return JSON.parse(content) as TableSchema;
  }
  async readAllRows(tableName: string, withOffset: true): Promise<StoredRow[]>;
  async readAllRows(tableName: string, withOffset?: false): Promise<Row[]>;
  async readAllRows(
    tableName: string,
    withOffset: boolean = false,
  ): Promise<StoredRow[] | Row[]> {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, tableName);
    const schema = await this.readSchema(tableName);

    const content = await this.storageService.readFile({
      path: tablePath,
    });

    const lines = content.split(LINE_BREAK);

    const rows: StoredRow[] = [];

    let offset = Buffer.byteLength(lines[0] + LINE_BREAK);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      const rowOffset = offset;

      offset += Buffer.byteLength(line + LINE_BREAK);

      if (line === '') continue;

      const fields = splitFields(line);

      if (fields[0] === WASTED_FLAG) continue;

      rows.push({
        row: decodeRow(fields.slice(1).join(DELIMITER), schema),
        offset: rowOffset,
      });
    }

    return withOffset ? rows : rows.map((ele) => ele?.row);
  }

  async createTable(dto: TableSchema) {
    const db = this.databaseService.requireCurrentDatabase();

    const dataPath = this.pathService.getTablePath(db, dto.name);

    if (await this.storageService.exists(dataPath)) {
      throw new HttpException(`Table ${dto.name} already exists`, 409);
    }

    const header = encodeHeader(dto);

    try {
      await this.storageService.createFile(dataPath, `${header}${LINE_BREAK}`);

      const schemaPath = this.pathService.getSchemaPath(db, dto.name);

      await this.storageService.writeJson(schemaPath, dto);
    } catch {
      await this.storageService.deleteFile(dataPath);

      throw new HttpException(`Failed to create table ${dto.name}`, 500);
    }
  }

  async insertRow(tableName: string, row: Row): Promise<void> {
    const dataPath = await this.requireDataPath(tableName);
    const schema = await this.readSchema(tableName);
    const encodedRowResult = encodeRow(row, schema);

    const newRow = `${LIVE_FLAG}${DELIMITER}${encodedRowResult}${LINE_BREAK}`;
    await this.storageService.appendFile({ path: dataPath, content: newRow });
  }
  async deleteRow(
    tableName: string,
    condition: {
      column: string;
      operator: string;
      value: string | number | boolean;
    } | null,
  ): Promise<void> {
    const rows = await this.readAllRows(tableName, true);

    const targets: StoredRow[] = [];
    rows.forEach((entry) => {
      if (!condition) return;
      if (this.rowChecker(entry.row, condition)) {
        targets.push(entry);
      }
    });

    if (targets.length === 0) {
      throw new HttpException('Row not found', 404);
    }

    await this.markWasted(
      tableName,
      targets.map((target) => target.offset),
    );
  }

  matchRows(
    rows: StoredRow[],
    condition: Record<string, unknown>,
  ): StoredRow[] {
    const keys = Object.keys(condition);

    return rows.filter((entry) =>
      keys.every((key) => String(entry.row[key]) === String(condition[key])),
    );
  }

  async markWasted(tableName: string, offsets: number[]): Promise<void> {
    const dataPath = await this.requireDataPath(tableName);
    const flag = Buffer.from(WASTED_FLAG, 'utf-8');

    if (flag.byteLength !== FLAG_WIDTH) {
      throw new HttpException('Corrupt wasted flag width', 500);
    }

    for (const offset of offsets) {
      await this.storageService.writeAt(dataPath, flag, offset);
    }
  }

  async applyUpdate(
    tableName: string,
    targets: StoredRow[],
    mergedRows: Row[],
  ): Promise<void> {
    await this.markWasted(
      tableName,
      targets.map((target) => target.offset),
    );

    for (const row of mergedRows) {
      await this.insertRow(tableName, row);
    }
  }

  async select(
    tableName: string,
    projection: string[] | undefined,
    where?: WhereClause,
  ): Promise<Row[]> {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, tableName);
    const schema = await this.readSchema(tableName);

    const content = await this.storageService.readFile({
      path: tablePath,
    });

    const lines = content.split(LINE_BREAK);

    const rows: Row[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (line === '') continue;

      const fields = splitFields(line);

      if (fields[0] === WASTED_FLAG) continue;
      const row = decodeRow(fields.slice(1).join(DELIMITER), schema);
      console.log(where);

      if (where) {
        const flag: any = this.rowChecker(row, where);
        if (flag === true) {
          const projectedRow = projection?.length
            ? this.projectionMethod(row, projection)
            : row;
          rows.push(projectedRow);
          continue;
        } else {
          continue;
        }
      }

      const projectedRow = projection?.length
        ? this.projectionMethod(row, projection)
        : row;
      rows.push(projectedRow);
    }
    // const keys = Object.keys(conditions);

    // if (keys.length) {
    //   rows = rows.filter((entry) =>
    //     keys.every((key) => String(entry[key]) === String(conditions[key])),
    //   );
    // }
    return rows;
  }

  private async requireDataPath(tableName: string): Promise<string> {
    const db = this.databaseService.requireCurrentDatabase();
    const dataPath = this.pathService.getTablePath(db, tableName);

    if (!(await this.storageService.exists(dataPath))) {
      throw new HttpException(`Table ${tableName} does not exist`, 404);
    }

    return dataPath;
  }
  private rowChecker(
    row: Row,
    where: {
      column: string;
      operator: string;
      value: string | number | boolean;
    },
  ) {
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
    }
  }
  private projectionMethod(row: Row, projection: string[]) {
    if (projection?.length && !projection.includes('*')) {
      const newObj = {};
      for (const [key, value] of Object.entries(row)) {
        if (!projection.includes(key)) continue;
        newObj[key] = value;
      }
      return newObj;
    }
    return row;
  }

  async dropTable(tableName: string) {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, tableName);
    if (!(await this.storageService.exists(tablePath))) {
      throw new HttpException('table not found', 404);
    }
    const schemaPath = this.pathService.getSchemaPath(db, tableName);

    await Promise.all([
      this.storageService.deleteFile(tablePath),
      this.storageService.deleteFile(schemaPath),
    ]);
  }

  async dropDatabase(databaseName: string) {
    const dbPath = this.pathService.getDatabasePath(databaseName);
    if (!(await this.storageService.exists(dbPath)))
      throw new HttpException(`Database ${databaseName} does not exist`, 404);

    if (databaseName === this.databaseService.getCurrentDatabase())
      throw new HttpException(
        'Cannot drop the currently connected database.',
        400,
      );
    await this.storageService.deleteDirectory(dbPath);
  }
}
