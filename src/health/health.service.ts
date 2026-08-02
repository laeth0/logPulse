import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface HealthStatus {
  status: 'ok' | 'error';
  database: 'connected' | 'disconnected';
  migrations: 'applied' | 'pending' | 'unknown';
  uptime: number;
  timestamp: string;
}

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
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async check(): Promise<HealthStatus> {
    const database = await this.checkDatabase();
    const migrations = database === 'connected' ? await this.checkMigrations() : 'unknown';

    return {
      status: database === 'connected' && migrations === 'applied' ? 'ok' : 'error',
      database,
      migrations,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async checkDatabase(): Promise<'connected' | 'disconnected'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }

  /**
   * Compares the list of executed migrations stored in the typeorm_migrations
   * table against the list of registered migration classes. If every registered
   * migration has a corresponding row the table, migrations are "applied".
   */
  private async checkMigrations(): Promise<'applied' | 'pending' | 'unknown'> {
    try {
      const executedMigrations = await this.dataSource.query<{ name: string }[]>(
        `SELECT name FROM typeorm_migrations`,
      );
      const executedNames = new Set(executedMigrations.map((m) => m.name));
      const registeredMigrations = this.dataSource.migrations;

      if (registeredMigrations.length === 0) return 'unknown';

      const allApplied = registeredMigrations.every((m) =>
        executedNames.has((m as unknown as { name: string }).name),
      );

      return allApplied ? 'applied' : 'pending';
    } catch {
      return 'unknown';
    }
  }
}
