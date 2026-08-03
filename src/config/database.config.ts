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
  };
}
