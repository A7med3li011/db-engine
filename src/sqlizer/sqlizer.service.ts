import { HttpException, Injectable } from '@nestjs/common';
import { ParserService } from 'src/parser/parser.service';
import { TokenizerService } from 'src/tokenizer/tokenizer.service';

@Injectable()
export class SqlizerService {
  constructor(
    private readonly parserService: ParserService,
    private readonly tokenizerService: TokenizerService,
  ) {}

  sqlize(statement: string) {
    const tokens = this.tokenizerService.tokenize(statement);
    if (!tokens.length) {
      throw new HttpException("statement can't be empty", 400);
    }

    return this.parserService.parse(tokens);
  }
}
