import { HttpException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PathService } from 'src/shared/path.service';
import { StorageService } from 'src/storage/storage.service';
import { Row, TableSchema } from 'src/table/interfaces/table-schema.interface';
import {
  DELIMITER,
  FLAG_WIDTH,
  LINE_BREAK,
  LIVE_FLAG,
  WASTED_FLAG,
} from './csv/csv-constants';
import { decodeRow, splitFields, encodeRow } from './csv/csv-codec';
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

  async insertRow(tableName: string, row: Row): Promise<void> {
    const dataPath = await this.requireDataPath(tableName);
    const schema = await this.readSchema(tableName);
    const encodedRowResult = encodeRow(row, schema);

    const newRow = `${LIVE_FLAG}${DELIMITER}${encodedRowResult}${LINE_BREAK}`;
    await this.storageService.appendFile({ path: dataPath, content: newRow });
  }
  async deleteRow(
    tableName: string,
    condition: Record<string, unknown>,
  ): Promise<void> {
    const keys = Object.keys(condition);

    if (keys.length === 0) {
      throw new HttpException('Delete requires a condition', 400);
    }

    const rows = await this.readAllRows(tableName, true);
    const targets = this.matchRows(rows, condition);

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

    conditions: Record<string, unknown>,
  ): Promise<Row[]> {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, tableName);
    const schema = await this.readSchema(tableName);

    const content = await this.storageService.readFile({
      path: tablePath,
    });

    const lines = content.split(LINE_BREAK);

    let rows: Row[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (line === '') continue;

      const fields = splitFields(line);

      if (fields[0] === WASTED_FLAG) continue;

      rows.push(decodeRow(fields.slice(1).join(DELIMITER), schema));
    }
    const keys = Object.keys(conditions);

    if (keys.length) {
      rows = rows.filter((entry) =>
        keys.every((key) => String(entry[key]) === String(conditions[key])),
      );
    }
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
}
