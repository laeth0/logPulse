import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CursorService } from '@/logs/cursor/cursor.service';
import { Log } from '@/logs/entities/log.entity';
import { LogsController } from '@/logs/logs.controller';
import { LogRepository } from '@/logs/repositories/log.repository';
import { LogAggregationService } from '@/logs/services/log-aggregation.service';
import { LogIngestionService } from '@/logs/services/log-ingestion.service';
import { LogQueryService } from '@/logs/services/log-query.service';
import { LogEntryValidator } from '@/logs/validators/log-entry.validator';
import { LogQueryValidator } from '@/logs/validators/log-query.validator';
import { TenancyModule } from '@/tenancy/tenancy.module';

@Module({
  imports: [TypeOrmModule.forFeature([Log], 'read'), TenancyModule],
  controllers: [LogsController],
  providers: [
    CursorService,
    LogRepository,
    LogEntryValidator,
    LogQueryValidator,
    LogIngestionService,
    LogQueryService,
    LogAggregationService,
  ],
  exports: [CursorService],
})
export class LogsModule {}
