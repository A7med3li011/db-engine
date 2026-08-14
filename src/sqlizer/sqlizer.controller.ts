import { Body, Controller, HttpException, Post } from '@nestjs/common';
import { SqlizerService } from './sqlizer.service';

@Controller('/sql')
export class SqlizerController {
  constructor(private readonly sqlizerService: SqlizerService) {}
  @Post()
  sqlize(@Body() payload: { statement: string }) {
   
    const { statement } = payload;
    if (!statement) throw new HttpException("statement can't be empty", 400);
    return this.sqlizerService.sqlize(statement);
  }
}
