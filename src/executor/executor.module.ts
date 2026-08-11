import { Module } from '@nestjs/common';
import { ExecutorService } from './executor.service';
import { DatabaseModule } from 'src/database/database.module';
import { TableModule } from 'src/table/table.module';
@Module({
  providers: [ExecutorService],
  imports: [DatabaseModule, TableModule],
  exports: [ExecutorService],
})
export class ExecutorModule {}
