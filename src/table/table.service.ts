import { HttpException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PathService } from 'src/shared/path.service';
import { StorageService } from 'src/storage/storage.service';
import { CreateTableDto } from './dtos/create-table.dto';
import { SchemaValidatoreService } from './schema-validator.service';
import { Row } from './interfaces/table-schema.interface';
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
  async create(dto: CreateTableDto): Promise<void> {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, dto.name);
    if (await this.storageService.exists(tablePath))
      throw new HttpException(`Table ${dto.name} already exists`, 409);

    this.SchemaValidatoreService.validate(dto);
    try {
      await this.storageService.createFile(tablePath);
      const schemaPath = this.pathService.getSchemaPath(db, dto.name);
      await this.storageService.writeJson(schemaPath, dto);
    } catch {
      await this.storageService.deleteFile(tablePath);
      throw new HttpException(`Failed to create table ${dto.name}`, 500);
    }
  }
  drop(): void {}
  async insert(tableName: string, row: Row): Promise<void> {
    const schema = await this.storageEngineService.readSchema(tableName);
    const allRows = await this.storageEngineService.readRows(tableName);
    this.ConstrainCheckerService.validate(row, allRows, schema);
    this.RowValidatoreService.validate(row, schema);

    await this.storageEngineService.appendRow(tableName, row);
  }
  update(): void {}
  delete(): void {}
}
