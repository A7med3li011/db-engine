import { Module } from '@nestjs/common';
import { SqlizerController } from './sqlizer.controller';
import { SqlizerService } from './sqlizer.service';
import { ParserModule } from 'src/parser/parser.module';

@Module({
  imports: [ParserModule],
  controllers: [SqlizerController],
  providers: [SqlizerService],
})
export class SqlizerModule {}
