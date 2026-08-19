import { HttpException, Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { created, ExecutionResult, ok } from 'src/shared/api-response';
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

  executeDDL(AST: AST): Promise<ExecutionResult> {
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

  private async executeSelect(AST: AST) {
    if (!AST.from) throw new HttpException(`you must select table`, 404);

    const rows = await this.tableService.select(
      AST.from,
      AST.columns,
      AST.where ?? undefined,
    );

    return ok(`${rows.length} row(s) selected`, rows);
  }
  private async executeInsert(AST: AST) {
    if (!AST.table) throw new HttpException(`you must mention table`, 404);
    if (!AST.values.length) throw new HttpException(`you must add values`, 404);
    if (!AST.columns?.length)
      throw new HttpException(`you must add values`, 404);

    await this.tableService.insert(AST.table, AST.columns, AST.values);

    return created(`Row inserted into ${AST.table} successfully`, {
      table: AST.table,
    });
  }
  private async executeDeleteRow(AST: AST) {
    if (!AST.from) throw new HttpException(`you must mention table`, 400);

    await this.tableService.delete(AST.from, AST.where ?? null);

    return ok(`Rows deleted from ${AST.from} successfully`, {
      table: AST.from,
    });
  }
  private async executeUpdate(AST: AST) {
    if (!AST.table) throw new HttpException(`you must mention table`, 400);
    if (!AST.updates)
      throw new HttpException('There are no values for updates', 400);
    if (!AST.where)
      throw new HttpException('There are no conditions for update', 400);

    await this.tableService.update(AST.table, AST.where, AST.updates);

    return ok(`Rows in ${AST.table} updated successfully`, {
      table: AST.table,
    });
  }

  private async executeCreateDatabase(AST: AST) {
    if (!AST.databaseName)
      throw new HttpException('database name is required', 400);
    await this.databaseService.create(AST.databaseName);

    return created(`Database ${AST.databaseName} created successfully`, {
      database: AST.databaseName,
    });
  }

  private async executeCreateTable(AST: AST) {
    if (!AST.tableName) throw new HttpException('table name is required', 400);
    if (!AST.columns?.length)
      throw new HttpException('table at least  must have a columns ', 400);

    await this.tableService.create({
      name: AST.tableName,
      columns: AST.columns as unknown as ColumnDefinition[],
    });

    return created(`Table ${AST.tableName} created successfully`, {
      table: AST.tableName,
    });
  }

  private async executeDropDatabase(AST: AST) {
    if (!AST.databaseName)
      throw new HttpException('database name is required', 400);
    await this.databaseService.drop(AST.databaseName);

    return ok(`Database ${AST.databaseName} dropped successfully`, {
      database: AST.databaseName,
    });
  }
  private async executeDropTable(AST: AST) {
    if (!AST.tableName) throw new HttpException('table name is required', 400);
    await this.tableService.drop(AST.tableName);

    return ok(`Table ${AST.tableName} dropped successfully`, {
      table: AST.tableName,
    });
  }
}
