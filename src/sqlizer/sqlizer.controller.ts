import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { SqlizerService } from './sqlizer.service';
import { getResponse } from 'src/shared/responseobject';
const code: Record<string, HttpStatus> = {
  '200': HttpStatus.OK,
  '201': HttpStatus.CREATED,
};

@Controller('/sql')
export class SqlizerController {
  constructor(private readonly sqlizerService: SqlizerService) {}
  @Post('ddl')
  async sqlizeDDL(@Body() payload: { statement: string }) {
    const { statement } = payload;
    if (!statement) throw new HttpException("statement can't be empty", 400);
    await this.sqlizerService.sqlizeDDL(statement);
    return getResponse();
  }
  @Post('dml')
  @HttpCode(HttpStatus.OK)
  async sqlizeDML(@Body() payload: { statement: string }) {
    const { statement } = payload;
    if (!statement) throw new HttpException("statement can't be empty", 400);
    await this.sqlizerService.sqlizeDML(statement);
    const obj = getResponse();
    console.log(obj);
    return {
      statusCode: code[obj.statusCode.toString()],
      message: obj.message,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: obj.data,
    };
  }
}
