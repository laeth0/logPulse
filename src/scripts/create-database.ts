import * as path from 'path';

import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function createDatabase(): Promise<void> {
  const dbName = process.env.DB_NAME;

  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: 'postgres',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    const { rows } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (rows.length > 0) {
      console.log(`ℹ️ Database "${dbName}" already exists, skipping creation`);
      return;
    }

    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ Database "${dbName}" created`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  createDatabase().catch((err: unknown) => {
    console.error('❌ Failed to create database:', err);
    process.exit(1);
  });
}
