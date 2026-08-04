import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { createDatabaseOptions } from '@/config/database.config';
import { HealthModule } from '@/health/health.module';
import { LogsModule } from '@/logs/logs.module';
import { RetentionModule } from '@/retention/retention.module';

@Module({
  imports: [
    // ── Database ────────────────────────────────────────────────────────────
    // Registers the default DataSource globally so any module can inject it
    // via @InjectDataSource() without a forFeature() call.
    // __dirname here is src/ (TS) or dist/ (compiled JS) — the correct base
    // directory for entity and migration globs.
    TypeOrmModule.forRootAsync({
      useFactory: () => createDatabaseOptions(__dirname),
    }),
    ScheduleModule.forRoot(),

    // ── Feature modules ──────────────────────────────────────────────────────
    HealthModule,
    LogsModule,
    RetentionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
