import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import type {
  DatabaseStatus,
  HealthStatus,
  MigrationStatus,
} from '@/health/health.types';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async check(): Promise<HealthStatus> {
    const database = await this.checkDatabase();

    const migrations =
      database === 'connected' ? await this.checkMigrations() : 'unknown';

    const isReady = database === 'connected' && migrations === 'applied';

    return {
      status: isReady ? 'ok' : 'error',
      database,
      migrations,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<DatabaseStatus> {
    if (!this.dataSource.isInitialized) {
      return 'disconnected';
    }

    try {
      await this.dataSource.query('SELECT 1');
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  private async checkMigrations(): Promise<MigrationStatus> {
    if (this.dataSource.migrations.length === 0) {
      return 'unknown';
    }

    try {
      const hasPendingMigrations = await this.dataSource.showMigrations();
      return hasPendingMigrations ? 'pending' : 'applied';
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not check migration status: ${message}`);
      return 'unknown';
    }
  }
}
