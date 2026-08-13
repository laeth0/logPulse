import * as path from 'node:path';

import type { DataSourceOptions } from 'typeorm';

/**
 * Builds a TypeORM {@link DataSourceOptions} object from environment variables.
 *
 * @param baseDirectory - Absolute path to the directory that acts as the root
 *   for entity and migration glob patterns.
 *
 *   • Nest runtime  (`app.module.ts`)  → pass `__dirname`  (= `src/` or `dist/`)
 *   • TypeORM CLI   (`data-source.ts`) → pass `path.join(__dirname, '..')` to go
 *     up one level from `src/config/` back to `src/`.
 */
export function createDatabaseOptions(
  baseDirectory: string,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    entities: [path.join(baseDirectory, '**/*.entity{.ts,.js}')],
    migrations: [path.join(baseDirectory, 'migrations/*{.ts,.js}')],
    migrationsRun: true,
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    logging: false,
    extra: {
      application_name: 'logpulse-write',
      max: Number(process.env.DB_WRITE_POOL_MAX ?? 20),
    },
  };
}

/**
 * Builds a second {@link DataSourceOptions} for `GET /logs` and
 * `GET /logs/aggregate`, backed by its own small connection pool so read
 * queries stop queueing behind `POST /logs` ingestion on the default
 * DataSource's pool. `migrationsRun` is disabled here because the default
 * DataSource already applies migrations at startup; running them twice would
 * race against that connection.
 */
export function createReadDatabaseOptions(
  baseDirectory: string,
): DataSourceOptions {
  return {
    ...createDatabaseOptions(baseDirectory),
    migrationsRun: false,
    extra: {
      application_name: 'logpulse-read',
      max: Number(process.env.DB_READ_POOL_MAX ?? 5),
    },
  };
}
