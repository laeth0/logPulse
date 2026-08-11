import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import {
  createDatabaseOptions,
  createReadDatabaseOptions,
} from '@/config/database.config';
import { HealthModule } from '@/health/health.module';
import { LogsModule } from '@/logs/logs.module';
import { RetentionModule } from '@/retention/retention.module';

@Module({
  imports: [
    // ── Database ────────────────────────────────────────────────────────────
    // Registers the default DataSource globally so any module can inject it
    // via @InjectDataSource() without a forFeature() call. This connection
    // handles ingestion (COPY) and migrations.
    // __dirname here is src/ (TS) or dist/ (compiled JS) — the correct base
    // directory for entity and migration globs.
    TypeOrmModule.forRootAsync({
      useFactory: () => createDatabaseOptions(__dirname),
    }),
    // Second, smaller-pooled DataSource dedicated to GET /logs and
    // GET /logs/aggregate, so read queries stop queueing behind ingestion on
    // the default connection's pool.
    TypeOrmModule.forRootAsync({
      name: 'read',
      useFactory: () => createReadDatabaseOptions(__dirname),
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
