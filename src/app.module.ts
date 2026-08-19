import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { TableModule } from './table/table.module';
import { SharedModule } from './shared/shared.module';
import { StorageEngineModule } from './storage-engine/storage-engine.module';
import { ParserModule } from './parser/parser.module';
import { ExecutorModule } from './executor/executor.module';
import { SqlizerModule } from './sqlizer/sqlizer.module';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    TableModule,
    SharedModule,
    StorageEngineModule,
    ParserModule,
    ExecutorModule,
    SqlizerModule
  ],
})
export class AppModule {}
