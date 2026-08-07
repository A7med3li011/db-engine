import { Module } from '@nestjs/common';
import { StorageEngineService } from './storage-engine.service';
import { SharedModule } from 'src/shared/shared.module';
import { StorageModule } from 'src/storage/storage.module';
import { DatabaseModule } from 'src/database/database.module';
import { StorageEngineController } from './storag-engine.controller';
import { PageSerializer } from './serialization/page-serializer';
import { PagerService } from './pager/pager.service';
import { PageDeserializer } from './serialization/page-deserializer';

@Module({
  imports: [DatabaseModule, StorageModule, SharedModule],
  controllers: [StorageEngineController],
  providers: [
    StorageEngineService,
    PageSerializer,
    PageDeserializer,
    PagerService,
  ],
  exports: [StorageEngineService],
})
export class StorageEngineModule {}
