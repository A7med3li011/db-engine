import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PathService } from 'src/shared/path.service';
import { StorageService } from 'src/storage/storage.service';
import {
  ColumnType,
  TableSchema,
} from 'src/table/interfaces/table-schema.interface';
import { IndexEntry, KeyColumn, TableIndexFile } from './table-index.interface';

@Injectable()
export class TableIndexService {
  constructor(
    private readonly pathService: PathService,
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  pickKeyColumn(schema: TableSchema): KeyColumn | null {
    const primary = schema.columns.find((column) => column.primaryKey);
    if (primary) return { name: primary.name, source: 'PRIMARY_KEY' };

    const serial = schema.columns.find(
      (column) => column.autoIncrement || column.type === ColumnType.SERIAL,
    );
    if (serial) return { name: serial.name, source: 'SERIAL' };

    return null;
  }

  normalizeKey(value: unknown): string {
    return String(value);
  }

  private getPath(tableName: string): string {
    const db = this.databaseService.requireCurrentDatabase();
    return this.pathService.getIndexPath(db, tableName);
  }

  async exists(tableName: string): Promise<boolean> {
    return this.storageService.exists(this.getPath(tableName));
  }

  async create(schema: TableSchema): Promise<void> {
    const key = this.pickKeyColumn(schema);
    if (!key) return;

    await this.write(schema.name, {
      table: schema.name,
      keyColumn: key.name,
      source: key.source,
      entries: {},
    });
  }

  
  async load(tableName: string): Promise<TableIndexFile | null> {
    const indexPath = this.getPath(tableName);
    if (!(await this.storageService.exists(indexPath))) return null;

    try {
      const content = await this.storageService.readFile({ path: indexPath });
      return JSON.parse(content) as TableIndexFile;
    } catch {
     
      return null;
    }
  }

  async write(tableName: string, index: TableIndexFile): Promise<void> {
    await this.storageService.writeJson(this.getPath(tableName), index);
  }

  async addEntry(
    tableName: string,
    key: unknown,
    entry: IndexEntry,
  ): Promise<void> {
    const index = await this.load(tableName);
    if (!index) return;

    index.entries[this.normalizeKey(key)] = entry;
    await this.write(tableName, index);
  }

  async removeEntries(tableName: string, keys: unknown[]): Promise<void> {
    if (!keys.length) return;

    const index = await this.load(tableName);
    if (!index) return;

    for (const key of keys) {
      delete index.entries[this.normalizeKey(key)];
    }
    await this.write(tableName, index);
  }

  async lookup(tableName: string, key: unknown): Promise<IndexEntry | null> {
    const index = await this.load(tableName);
    if (!index) return null;

    return index.entries[this.normalizeKey(key)] ?? null;
  }

  
  async hasKey(tableName: string, key: unknown): Promise<boolean> {
    const index = await this.load(tableName);
    if (!index) return false;

    return this.normalizeKey(key) in index.entries;
  }

  async drop(tableName: string): Promise<void> {
    await this.storageService.deleteFile(this.getPath(tableName));
  }
}
