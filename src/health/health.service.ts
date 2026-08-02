import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { DatabaseStatus, HealthStatus, MigrationStatus } from '@/health/health.types';

/**
 * Performs deep health checks against each infrastructure dependency.
 *
 * The load generator polls GET /health before starting any load test.
 * Per the spec the endpoint must only return 200 once:
 *  1. The database connection has been established.
 *  2. Migrations have been applied.
 *  3. The service is ready to accept logs.
 */
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

  // ── Private helpers ────────────────────────────────────────────────────────

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

  /**
   * Uses dataSource.showMigrations() so we never hardcode the migrations table
   * name (TypeORM default is "migrations", not "typeorm_migrations") and never
   * compare migration names with unsafe casts.
   *
   * showMigrations() returns true when pending migrations exist.
   */
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
