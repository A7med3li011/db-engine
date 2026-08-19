import { Module } from '@nestjs/common';
import { PathService } from './path.service';
import { LockService } from './lock.service';

@Module({
  providers: [PathService, LockService],
  exports: [PathService, LockService],
})
export class SharedModule {}
