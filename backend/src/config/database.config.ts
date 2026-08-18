import * as path from 'node:path';

import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import type { DataSourceOptions } from 'typeorm';

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

export function createReadDatabaseOptions(
  baseDirectory: string,
): TypeOrmModuleOptions {
  return {
    ...createDatabaseOptions(baseDirectory),
    name: 'read',
    migrationsRun: false,
    extra: {
      application_name: 'logpulse-read',
      max: Number(process.env.DB_READ_POOL_MAX ?? 5),
    },
  };
}
