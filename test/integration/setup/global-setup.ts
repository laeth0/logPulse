import './load-testing-environment';

import { Client } from 'pg';

export default async function globalSetup(): Promise<void> {
  const databaseName = process.env.DB_NAME as string;
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: 'postgres',
    ssl:
      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    await client.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await client.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await client.end();
  }
}
