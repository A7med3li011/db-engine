import { Module } from '@nestjs/common';
import { ParserService } from './parser.service';
import { ExecutorModule } from 'src/executor/executor.module';

@Module({
  providers: [ParserService],
  exports: [ParserService],
  imports: [ExecutorModule],
})
export class ParserModule {}
