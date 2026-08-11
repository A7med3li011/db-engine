import { HttpException, Injectable } from '@nestjs/common';
import { ParserService } from 'src/parser/parser.service';
import { tokenize } from 'src/parser/tokenizer/tokenizer';

@Injectable()
export class SqlizerService {
  constructor(private readonly parserService: ParserService) {}

  sqlize(statement: string) {
    const tokens = tokenize(statement);

    if (!tokens.length) {
      throw new HttpException("statement can't be empty", 400);
    }

    return this.parserService.parse(tokens);
  }
}
