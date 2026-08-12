import { HttpException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { ColumnDefinition } from 'src/table/interfaces/table-schema.interface';
import { TableService } from 'src/table/table.service';
type SQLValue = string | number | boolean | null;
type AST = {
  type: string;
  from?: string;
  table?: string;
  tableName?: string;
  databaseName?: string;
  values: string[];
  columns?: string[];
  updates?: Record<string, SQLValue>;
  where?: {
    column: string;
    operator: string;
    value: string | number | boolean;
  } | null;
};
@Injectable()
export class ExecutorService {
  constructor(
    private readonly tableService: TableService,
    private readonly databaseService: DatabaseService,
  ) {}

  executeDDL(AST: AST) {
    console.log(AST, 'from exe');

    const { type } = AST;
    switch (type) {
      case 'SELECT':
        return this.executeSelect(AST);

      case 'INSERT':
        return this.executeInsert(AST);
      case 'DELETE':
        return this.executeDeleteRow(AST);
      case 'UPDATE':
        return this.executeUpdate(AST);
      case 'DROP':
        if (AST.tableName) {
          return this.executeDropTable(AST);
        } else {
          return this.executeDropDatabase(AST);
        }
      case 'CREATE':
        if (AST.tableName) {
          return this.executeCreateTable(AST);
        } else {
          return this.executeCreateDatabase(AST);
        }

      default:
        throw new HttpException('unknown type',400);
    }
  }

  private executeSelect(AST: AST) {
    if (!AST.from) throw new HttpException(`you must select table`, 404);

    if (AST.where) {
      return this.tableService.select(AST.from, AST.columns, AST.where);
    } else {
      return this.tableService.select(AST.from, AST.columns, undefined);
    }
  }
  private executeInsert(AST: AST) {
    if (!AST.table) throw new HttpException(`you must mention table`, 404);
    if (!AST.values.length) throw new HttpException(`you must add values`, 404);
    if (!AST.columns?.length)
      throw new HttpException(`you must add values`, 404);

    return this.tableService.insert(AST.table, AST.columns, AST.values);
  }
  private async executeDeleteRow(AST: AST) {
    if (!AST.from) return;
    return await this.tableService.delete(AST.from, AST.where ?? null);
  }
  private async executeUpdate(AST: AST) {
    if (!AST.table || !AST.where || !AST.updates) return;
    return await this.tableService.update(AST.table, AST.where, AST.updates);
  }

  private async executeCreateDatabase(AST: AST) {
    if (!AST.databaseName)
      throw new HttpException('database name is required', 400);
    await this.databaseService.create(AST.databaseName);
  }

  private async executeCreateTable(AST: AST) {
    if (!AST.tableName) throw new HttpException('table name is required', 400);
    if (!AST.columns?.length)
      throw new HttpException('table at least  must have a columns ', 400);

    await this.tableService.create({
      name: AST.tableName,
      columns: AST.columns as unknown as ColumnDefinition[],
    });
  }

  private async executeDropDatabase(AST: AST) {
    if (!AST.databaseName)
      throw new HttpException('database name is required', 400);
    await this.databaseService.drop(AST.databaseName);
  }
  private async executeDropTable(AST: AST) {
    await this.tableService.drop(AST.tableName);
  }
  //   async executeDML(statment: string) {}
}
