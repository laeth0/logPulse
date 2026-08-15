import { Module } from '@nestjs/common';

import { HealthController } from '@/health/health.controller';
import { HealthService } from '@/health/health.service';

/**
 * HealthModule — no TypeOrmModule.forFeature() needed here.
 *
 * Once TypeOrmModule.forRoot() / forRootAsync() is registered in AppModule,
 * the default DataSource is globally available and injectable via
 * @InjectDataSource() without any feature-module registration.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
