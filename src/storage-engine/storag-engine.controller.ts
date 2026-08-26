import { Controller, Get, Param } from '@nestjs/common';
import { StorageEngineService } from './storage-engine.service';

@Controller('storage-engine')
export class StorageEngineController {
  constructor(private readonly storageEngineService: StorageEngineService) {}

  @Get('/schema/:tableName')
  async readSchema(@Param('tableName') tableName: string) {
    return this.storageEngineService.readSchema(tableName);
  }
}
