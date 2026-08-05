import { Module } from '@nestjs/common';
import { TableService } from './table.service';
import { DatabaseModule } from 'src/database/database.module';
import { StorageModule } from 'src/storage/storage.module';
import { SharedModule } from 'src/shared/shared.module';
import { TableController } from './table.controller';
import { SchemaValidatoreService } from './schema-validator.service';
import { RowValidatoreService } from './row-validator.service';
import { StorageEngineModule } from 'src/storage-engine/storage-engine.module';
import { ConstrainCheckerService } from './constrain-checkers.service';

@Module({
  imports: [DatabaseModule, StorageModule, SharedModule, StorageEngineModule],
  providers: [
    TableService,
    SchemaValidatoreService,
    RowValidatoreService,
    ConstrainCheckerService,
  ],
  controllers: [TableController],
})
export class TableModule {}
