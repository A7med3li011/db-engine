import { Injectable } from '@nestjs/common';
import * as path from 'path';

@Injectable()
export class PathService {
  getDatabaseRoot(): string {
    return path.join(process.cwd(), 'databases');
  }

  getDatabasePath(databaseName: string): string {
    return path.join(this.getDatabaseRoot(), databaseName);
  }
  getSchemaPath(databaseName: string, table: string): string {
    return path.join(this.getDatabasePath(databaseName), `${table}.schema.json`);
  }
  getTablePath(databaseName: string, tableName: string): string {
    return path.join(this.getDatabasePath(databaseName), `${tableName}.ndjson`);
  }
}
