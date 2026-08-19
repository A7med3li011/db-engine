import { Controller, Get, Param } from '@nestjs/common';
import { ok } from 'src/shared/api-response';
import { StorageEngineService } from './storage-engine.service';

@Controller('storage-engine')
export class StorageEngineController {
  constructor(private readonly storageEngineService: StorageEngineService) {}

  @Get('/schema/:tableName')
  async readSchema(@Param('tableName') tableName: string) {
    const schema = await this.storageEngineService.readSchema(tableName);

    return ok('Schema fetched successfully', schema);
  }
}
