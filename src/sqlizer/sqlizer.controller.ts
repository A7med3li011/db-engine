import { Body, Controller, HttpException, Post } from '@nestjs/common';
import { SqlizerService } from './sqlizer.service';

@Controller('/sql')
export class SqlizerController {
  constructor(private readonly sqlizerService: SqlizerService) {}
  @Post('ddl')
  sqlizeDDL(@Body() payload: { statement: string }) {
    const { statement } = payload;
    if (!statement) throw new HttpException("statement can't be empty", 400);
    return this.sqlizerService.sqlizeDDL(statement);
  }
  @Post('dml')
  sqlizeDML(@Body() payload: { statement: string }) {
    const { statement } = payload;
    if (!statement) throw new HttpException("statement can't be empty", 400);
    return this.sqlizerService.sqlizeDML(statement);
  }
}
