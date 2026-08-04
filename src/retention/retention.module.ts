import { Module } from '@nestjs/common';

import { PartitionService } from '@/retention/partition.service';
import { RetentionScheduler } from '@/retention/retention.scheduler';
import { RetentionService } from '@/retention/retention.service';

@Module({
  providers: [PartitionService, RetentionService, RetentionScheduler],
})
export class RetentionModule {}
