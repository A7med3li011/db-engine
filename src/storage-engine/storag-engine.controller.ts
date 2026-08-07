import { Controller, Get, Param } from '@nestjs/common';
import { StorageEngineService } from './storage-engine.service';

@Controller('storage-engine')
export class StorageEngineController {
  constructor(private readonly storageEngineService: StorageEngineService) {}

  // Raw scan, including rows that were soft deleted. Useful for checking the file.
  @Get('/rows/:tableName')
  async readAllRows(@Param('tableName') tableName: string) {
    return { data: await this.storageEngineService.scan(tableName) };
  }

  @Get('/schema/:tableName')
  async readSchema(@Param('tableName') tableName: string) {
    return { data: await this.storageEngineService.readSchema(tableName) };
  }
}
