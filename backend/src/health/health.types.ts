export type DatabaseStatus = 'connected' | 'disconnected';

export type MigrationStatus = 'applied' | 'pending' | 'unknown';

export interface HealthStatus {
  status: 'ok' | 'error';
  database: DatabaseStatus;
  migrations: MigrationStatus;
  uptime: number;
  timestamp: string;
}
