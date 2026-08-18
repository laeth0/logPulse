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
    // ── Database ────────────────────────────────────────────────────────────
    // Registers the single DataSource globally so any module can inject it
    // via @InjectDataSource() without a forFeature() call. This connection
    // handles ingestion (COPY), migrations, and all read queries.
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
    TenancyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
