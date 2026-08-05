import { Body, Controller, Param, Post } from '@nestjs/common';
import { TableService } from './table.service';
import { CreateTableDto } from './dtos/create-table.dto';

@Controller('table')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Post()
  async createTable(@Body() payload: CreateTableDto): Promise<void> {
    await this.tableService.create(payload);
  }
  @Post('/insert/:tableName')
  async insertRow(
    @Param('tableName') tableName: string,
    @Body() row: Record<string, unknown>,
  ): Promise<void> {
    await this.tableService.insert(tableName, row);
  }
}
