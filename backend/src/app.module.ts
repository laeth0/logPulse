import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { createDatabaseOptions } from '@/config/database.config';
import { HealthModule } from '@/health/health.module';
import { LogsModule } from '@/logs/logs.module';
import { RetentionModule } from '@/retention/retention.module';
import { TenancyModule } from '@/tenancy/tenancy.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => createDatabaseOptions(__dirname),
    }),
    ScheduleModule.forRoot(),

    HealthModule,
    LogsModule,
    RetentionModule,
    TenancyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
