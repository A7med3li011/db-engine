import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { StorageModule } from '../storage/storage.module';
import { DatabaseController } from './database.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [StorageModule, SharedModule],
  providers: [DatabaseService],
  exports: [DatabaseService],
  controllers: [DatabaseController],
})
export class DatabaseModule {}
