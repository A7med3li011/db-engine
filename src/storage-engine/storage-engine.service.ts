import { HttpException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PathService } from 'src/shared/path.service';
import { StorageService } from 'src/storage/storage.service';
import {
  Row,
  SerialCounter,
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
import { TableIndexService } from './index/table-index.service';
import { KeyColumn } from './index/table-index.interface';

@Injectable()
export class StorageEngineService {
  constructor(
    private readonly pathService: PathService,
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
    private readonly tableIndexService: TableIndexService,
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
    console.log(lines);
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

      const autoIncColumn = dto.columns.filter((el) => el.autoIncrement);
      if (autoIncColumn.length) {
        const incrementalPath = this.pathService.getIncrementalPath(
          db,
          dto.name,
        );
        const arr: any[] = [];
        autoIncColumn.forEach((el) => {
          arr.push({ column: el.name, latest_value: 0 });
        });
        await this.storageService.writeJson(incrementalPath, arr);
      }
      await this.storageService.writeJson(schemaPath, dto);
      await this.tableIndexService.create(dto);
    } catch {
      await this.storageService.deleteFile(dataPath);
      await this.tableIndexService.drop(dto.name);

      throw new HttpException(`Failed to create table ${dto.name}`, 500);
    }
  }

  async insertRow(tableName: string, row: Row): Promise<void> {
    const dataPath = await this.requireDataPath(tableName);
    const schema = await this.readSchema(tableName);

    const encodedRowResult = encodeRow(row, schema);

    const newRow = `${LIVE_FLAG}${DELIMITER}${encodedRowResult}${LINE_BREAK}`;

    await this.storageService.appendFile({ path: dataPath, content: newRow });
    const key = this.tableIndexService.pickKeyColumn(schema);
    if (key) {
      const length = Buffer.byteLength(newRow);
      const offset = (await this.storageService.fileSize(dataPath)) - length;
      await this.tableIndexService.addEntry(tableName, row[key.name], {
        offset,
        length,
      });
    }
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
      throw new HttpException('there is no matched row', 404);
    }

    await this.markWasted(
      tableName,
      targets.map((target) => target.offset),
    );
    await this.removeIndexKeys(
      tableName,
      targets.map((t) => t.row),
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

    await this.removeIndexKeys(
      tableName,
      targets.map((t) => t.row),
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

    const keyColumn = this.tableIndexService.pickKeyColumn(schema);

    if (
      keyColumn &&
      where?.operator === '=' &&
      where.column === keyColumn.name
    ) {
      const indexed = await this.selectByIndex(
        tableName,
        tablePath,
        schema,
        keyColumn,
        where.value,
      );

      if (indexed) {
        return indexed.map((row) =>
          projection?.length ? this.projectionMethod(row, projection) : row,
        );
      }
    }

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

    return rows;
  }

  private async selectByIndex(
    tableName: string,
    tablePath: string,
    schema: TableSchema,
    keyColumn: KeyColumn,
    value: string | number | boolean,
  ): Promise<Row[] | null> {
    const entry = await this.tableIndexService.lookup(tableName, value);
    if (!entry?.length) return null;

    const buffer = Buffer.alloc(entry.length);
    const bytesRead = await this.storageService.readAt(
      tablePath,
      buffer,
      entry.offset,
    );
    if (!bytesRead) return null;

    const line = buffer.toString('utf-8', 0, bytesRead).split(LINE_BREAK)[0];
    const fields = splitFields(line);

    if (fields[0] === WASTED_FLAG) return [];
    if (fields.length !== schema.columns.length + 1) return null;

    const row = decodeRow(fields.slice(1).join(DELIMITER), schema);

    const normalizedKey = this.tableIndexService.normalizeKey(value);
    if (
      this.tableIndexService.normalizeKey(row[keyColumn.name]) !== normalizedKey
    ) {
      return null;
    }

    return [row];
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
      this.tableIndexService.drop(tableName),
    ]);
  }

  async retrieveSerails(tableName: string): Promise<SerialCounter[]> {
    const db = this.databaseService.requireCurrentDatabase();
    const incrementalPath = this.pathService.getIncrementalPath(db, tableName);

    if (!(await this.storageService.exists(incrementalPath))) return [];

    const data = await this.storageService.readFile({ path: incrementalPath });

    return JSON.parse(data) as SerialCounter[];
  }
  async incrementCurrentSerail(tableName: string, data: any): Promise<void> {
    const db = this.databaseService.requireCurrentDatabase();
    const incrementalPath = this.pathService.getIncrementalPath(db, tableName);

    await this.storageService.writeFile(incrementalPath, JSON.stringify(data));
  }
  private async removeIndexKeys(tableName: string, rows: Row[]): Promise<void> {
    const schema = await this.readSchema(tableName);
    const key = this.tableIndexService.pickKeyColumn(schema);
    if (!key) return;

    await this.tableIndexService.removeEntries(
      tableName,
      rows.map((row) => row[key.name]),
    );
  }
}
