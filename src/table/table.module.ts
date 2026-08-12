import { Module } from '@nestjs/common';
import { TableService } from './table.service';

import { SharedModule } from 'src/shared/shared.module';
import { SchemaValidatoreService } from './schema-validator.service';
import { RowValidatoreService } from './row-validator.service';
import { StorageEngineModule } from 'src/storage-engine/storage-engine.module';
import { ConstrainCheckerService } from './constrain-checkers.service';

@Module({
  imports: [SharedModule, StorageEngineModule],
  providers: [
    TableService,
    SchemaValidatoreService,
    RowValidatoreService,
    ConstrainCheckerService,
  ],
  exports: [TableService],
})
export class TableModule {}
