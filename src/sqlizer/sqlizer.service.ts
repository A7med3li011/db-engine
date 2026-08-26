import { HttpException, Injectable } from '@nestjs/common';
import { ParserService } from 'src/parser/parser.service';
import { TokenizerService } from 'src/tokenizer/tokenizer.service';

const ddlKeys = ['create', 'drop'];
@Injectable()
export class SqlizerService {
  constructor(
    private readonly parserService: ParserService,
    private readonly tokenizerService: TokenizerService,
  ) {}
  sqlizeDDL(statement: string) {
    const tokens = this.tokenizerService.tokenize(statement);
    console.log(tokens, 'tokens');
    if (!tokens.length) {
      throw new HttpException("statement can't be empty", 400);
    }
    if (!ddlKeys.includes(tokens[0].value.toLowerCase())) {
      throw new HttpException('this method for DDL only', 400);
    }
    return this.parserService.parse(tokens);
  }
  sqlizeDML(statement: string) {
    const tokens = this.tokenizerService.tokenize(statement);
    if (!tokens.length) {
      throw new HttpException("statement can't be empty", 400);
    }
    if (ddlKeys.includes(tokens[0].value.toLowerCase())) {
      throw new HttpException('this method for DML only', 400);
    }

    return this.parserService.parse(tokens);
  }
}
