import { HttpException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { PathService } from 'src/shared/path.service';
import { StorageService } from 'src/storage/storage.service';
import { Row, TableSchema } from 'src/table/interfaces/table-schema.interface';

@Injectable()
export class StorageEngineService {
  constructor(
    private readonly pathService: PathService,
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  async appendRow(tableName: string, row: unknown): Promise<void> {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, tableName);
    if (!(await this.storageService.exists(tablePath))) {
      throw new HttpException(`Table ${tableName} does not exist`, 404);
    }

    const modifiedContent = JSON.stringify(row) + '\n';

    try {
      await this.storageService.appendFile({
        path: tablePath,
        content: modifiedContent,
      });
    } catch {
      throw new HttpException(
        `Failed to append row to table ${tableName}`,
        500,
      );
    }
  }

  async readRows(tableName: string): Promise<Row[]> {
    const db = this.databaseService.requireCurrentDatabase();
    const tablePath = this.pathService.getTablePath(db, tableName);
    if (!(await this.storageService.exists(tablePath))) {
      throw new HttpException(`Table ${tableName} does not exist`, 404);
    }
    const content = await this.storageService.readFile({ path: tablePath });
    return content
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as Row);
  }
  async readSchema(tableName: string): Promise<TableSchema> {
    const db = this.databaseService.requireCurrentDatabase();
    const schemaPath = this.pathService.getSchemaPath(db, tableName);
    if (!(await this.storageService.exists(schemaPath))) {
      throw new HttpException(`Schema ${tableName} does not exist`, 404);
    }
    const content = await this.storageService.readFile({ path: schemaPath });

    return JSON.parse(content) as TableSchema;
  }

  findRows(): void {}

  rewriteRows(): void {}

  countRows(): void {}
}
