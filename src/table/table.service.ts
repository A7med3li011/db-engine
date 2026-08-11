import { HttpException, Injectable } from '@nestjs/common';
import { SchemaValidatoreService } from './schema-validator.service';
import { Row, TableSchema } from './interfaces/table-schema.interface';
import { RowValidatoreService } from './row-validator.service';
import { StorageEngineService } from 'src/storage-engine/storage-engine.service';
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

  async insert(tableName: string, row: Row): Promise<void> {
    const schema = await this.storageEngineService.readSchema(tableName);
    const allRows = await this.storageEngineService.readAllRows(tableName);

    this.ConstrainCheckerService.validate(row, allRows, schema);
    this.RowValidatoreService.validate(row, schema);

    await this.storageEngineService.insertRow(tableName, row);
  }

  async select(
    tableName: string,
    where: Record<string, unknown> = {},
  ): Promise<Row[]> {
    const rows = await this.storageEngineService.select(tableName, where);

    return rows;
  }

  async update(
    tableName: string,
    where: Record<string, unknown>,
    updates: Record<string, unknown>,
  ): Promise<void> {
    if (Object.keys(updates).length === 0) {
      throw new HttpException('There are no values for updates', 400);
    }

    if (Object.keys(where).length === 0) {
      throw new HttpException('There are no conditions for update', 400);
    }

    const schema = await this.storageEngineService.readSchema(tableName);
    const storedRows = await this.storageEngineService.readAllRows(
      tableName,
      true,
    );

    const targets = this.storageEngineService.matchRows(storedRows, where);

    if (targets.length === 0) {
      throw new HttpException('There are no matched rows for update', 404);
    }

    // Validate against the table as it will look *after* the update, so that
    // rows changed by this same statement collide with each other instead of
    // passing against a stale snapshot.
    const projected = storedRows.map((entry) => entry.row);
    const changedIndexes: number[] = [];

    for (const target of targets) {
      const index = storedRows.indexOf(target);

      projected[index] = { ...target.row, ...updates };
      changedIndexes.push(index);
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
  async delete(
    tableName: string,
    where: Record<string, unknown>,
  ): Promise<void> {
    await this.storageEngineService.deleteRow(tableName, where);
  }

  drop(): void {}
}
