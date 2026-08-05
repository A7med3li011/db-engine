import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { StorageEngineService } from './storage-engine.service';

@Controller('storage-engine')
export class StorageEngineController {
  constructor(private readonly storageEngineService: StorageEngineService) {}

  @Post('/row')
  async appendRow(
    @Body() payload: { tableName: string; id: number; title: string },
  ) {
    await this.storageEngineService.appendRow(payload.tableName, payload);
  }
  @Get('/rows/:tableName')
  async readAllRows(@Param('tableName') tableName: string) {
    const res = await this.storageEngineService.readRows(tableName);
    return { data: res };
  }
  @Get('/schema/:tableName')
  async readSchema(@Param('tableName') tableName: string) {
    const res = await this.storageEngineService.readSchema(tableName);
    return { data: res };
  }
}
