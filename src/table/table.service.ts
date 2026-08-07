import { HttpException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PathService } from 'src/shared/path.service';
import { StorageService } from 'src/storage/storage.service';
import { SchemaValidatoreService } from './schema-validator.service';
import {
  ColumnType,
  Row,
  TableSchema,
} from './interfaces/table-schema.interface';
import { RowValidatoreService } from './row-validator.service';
import { StorageEngineService } from 'src/storage-engine/storage-engine.service';
import { ConstrainCheckerService } from './constrain-checkers.service';

@Injectable()
export class TableService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
    private readonly pathService: PathService,
    private readonly SchemaValidatoreService: SchemaValidatoreService,
    private readonly storageEngineService: StorageEngineService,
    private readonly RowValidatoreService: RowValidatoreService,
    private readonly ConstrainCheckerService: ConstrainCheckerService,
  ) {}

  async create(dto: TableSchema): Promise<void> {
    const db = this.databaseService.requireCurrentDatabase();
    const dataPath = this.pathService.getTablePath(db, dto.name);

    if (await this.storageService.exists(dataPath))
      throw new HttpException(`Table ${dto.name} already exists`, 409);

    this.addIsActiveColumn(dto);
    this.SchemaValidatoreService.validate(dto);

    try {
      await this.storageService.createFile(dataPath);
      const schemaPath = this.pathService.getSchemaPath(db, dto.name);
      await this.storageService.writeJson(schemaPath, dto);
    } catch {
      await this.storageService.deleteFile(dataPath);
      throw new HttpException(`Failed to create table ${dto.name}`, 500);
    }
  }

  async insert(tableName: string, row: Row): Promise<void> {
    const schema = await this.storageEngineService.readSchema(tableName);
    const allRows = (await this.storageEngineService.scan(tableName)).map(
      (entry) => entry.row,
    );

    this.ConstrainCheckerService.validate(row, allRows, schema);
    this.RowValidatoreService.validate(row, schema);

    await this.storageEngineService.insertRow(tableName, row);
  }

  async select(
    tableName: string,
    where: Record<string, unknown> = {},
  ): Promise<Row[]> {
    const rows = await this.storageEngineService.scan(tableName);
    const keys = Object.keys(where);

    return rows
      .map((entry) => entry.row)
      .filter((row) => row.isActive !== false)
      .filter((row) => keys.every((key) => row[key] === where[key]));
  }

  async update(
    tableName: string,
    where: Record<string, unknown>,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const schema = await this.storageEngineService.readSchema(tableName);
    const rows = await this.storageEngineService.scan(tableName);

    const key = Object.keys(where)[0];
    const index = rows.findIndex((entry) => entry.row[key] === where[key]);
    if (index === -1) throw new HttpException('row not found', 404);

    const updatedRow = { ...rows[index].row, ...updates };
    const allRows = rows.map((entry) => entry.row);

    this.ConstrainCheckerService.validate(updatedRow, allRows, schema, index);
    this.RowValidatoreService.validate(updatedRow, schema);

    await this.storageEngineService.updateRow(
      tableName,
      rows[index].rowId,
      updatedRow,
    );
  }

  async delete(
    tableName: string,
    where: Record<string, unknown>,
  ): Promise<void> {
    await this.update(tableName, where, { isActive: false });
  }

  drop(): void {}

  private addIsActiveColumn(schema: TableSchema): void {
    if (schema.columns.some((column) => column.name === 'isActive')) return;

    schema.columns.push({
      name: 'isActive',
      type: ColumnType.BOOLEAN,
      default: true,
    });
  }
}
