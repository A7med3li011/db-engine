import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { Token } from 'src/parser/tokenizer/token.interface';
import { TableService } from 'src/table/table.service';

@Injectable()
export class ExecutorService {
  constructor(
    private readonly tableService: TableService,
    private readonly databaseService: DatabaseService,
  ) {}

  executeDDL(tokens: Token[]) {
    console.log(tokens, 'from exe');
    return 's';
  }

  private executeSelect(tokens: Token[]) {}
  private executeInsert(tokens: Token[]) {}
  private executeUpdate(tokens: Token[]) {}
  private executeDeleteRow(tokens: Token[]) {}
  private executeCreateDatabase(tokens: Token[]) {}
  private executeDropDatabase(tokens: Token[]) {}
  private executeCreateTable(tokens: Token[]) {}
  private executeDropTable(tokens: Token[]) {}
  //   async executeDML(statment: string) {}
}
