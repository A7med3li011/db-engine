import { Module } from '@nestjs/common';
import { SqlizerController } from './sqlizer.controller';
import { SqlizerService } from './sqlizer.service';
import { ParserModule } from 'src/parser/parser.module';
import { TokenizerModule } from 'src/tokenizer/tokenizer.module';

@Module({
  imports: [ParserModule, TokenizerModule],
  controllers: [SqlizerController],
  providers: [SqlizerService],
})
export class SqlizerModule {}
