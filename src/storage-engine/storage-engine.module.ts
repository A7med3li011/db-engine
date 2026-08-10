import { Module } from '@nestjs/common';
import { StorageEngineService } from './storage-engine.service';
import { SharedModule } from 'src/shared/shared.module';
import { StorageModule } from 'src/storage/storage.module';
import { DatabaseModule } from 'src/database/database.module';
import { StorageEngineController } from './storag-engine.controller';

@Module({
  imports: [DatabaseModule, StorageModule, SharedModule],
  controllers: [StorageEngineController],
  providers: [StorageEngineService],
  exports: [StorageEngineService],
})
export class StorageEngineModule {}
