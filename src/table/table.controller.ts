import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { TableService } from './table.service';

@Controller('table')
export class TableController {
  constructor(private readonly tableService: TableService) {}

  @Post()
  async createTable(@Body() payload: any): Promise<void> {
    await this.tableService.create(payload);
  }

  @Post('/insert/:tableName')
  async insertRow(
    @Param('tableName') tableName: string,
    @Body() row: Record<string, unknown>,
  ): Promise<void> {
    await this.tableService.insert(tableName, row);
  }

  @Post('/select/:tableName')
  async selectRows(
    @Param('tableName') tableName: string,
    @Body() where: Record<string, unknown>,
  ) {
    // return { data: await this.tableService.select(tableName, where) };
    return { data: await this.tableService.select(tableName, where) };
  }

  @Patch('/:tableName')
  async updateRows(
    @Param('tableName') tableName: string,
    @Body()
    payload: {
      where: Record<string, unknown>;
      updates: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.tableService.update(tableName, payload.where, payload.updates);
  }

  @Delete('/:tableName')
  async deleteRows(
    @Param('tableName') tableName: string,
    @Body() where: Record<string, unknown>,
  ): Promise<void> {
    await this.tableService.delete(tableName, where);
  }
}
