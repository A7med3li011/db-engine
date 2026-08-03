import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { StorageModule } from '../storage/storage.module';
import { DatabaseController } from './database.controller';

@Module({
  imports: [StorageModule],
  providers: [DatabaseService],
  exports: [DatabaseService],
  controllers: [DatabaseController],
})
export class DatabaseModule {}
