import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RetentionService } from '@/retention/retention.service';

@Injectable()
export class RetentionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetentionScheduler.name);

  constructor(private readonly retentionService: RetentionService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.executeMaintenance();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'log-retention-maintenance',
    timeZone: 'UTC',
    waitForCompletion: true,
  })
  async executeMaintenance(): Promise<void> {
    try {
      await this.retentionService.runMaintenance();
    } catch (error) {
      const errorDetails =
        error instanceof Error ? (error.stack ?? error.message) : String(error);

      this.logger.error('Retention maintenance failed', errorDetails);
    }
  }
}
