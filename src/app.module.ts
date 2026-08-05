import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { TableModule } from './table/table.module';
import { SharedModule } from './shared/shared.module';
import { StorageEngineModule } from './storage-engine/storage-engine.module';

@Module({
  imports: [DatabaseModule, StorageModule, TableModule, SharedModule,StorageEngineModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
