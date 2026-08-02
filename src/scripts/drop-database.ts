import * as path from 'path';

import * as dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function dropDatabase(): Promise<void> {
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
    await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    console.log(`✅ Database "${dbName}" dropped`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  dropDatabase().catch((err: unknown) => {
    console.error('❌ Failed to drop database:', err);
    process.exit(1);
  });
}
