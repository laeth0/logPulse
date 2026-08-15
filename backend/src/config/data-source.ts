import 'reflect-metadata';
import * as path from 'path';

import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

import { createDatabaseOptions } from '@/config/database.config';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// __dirname here is src/config (TS source) or dist/config (compiled JS).
// Go up one level so entity and migration globs are rooted at src/ or dist/.
export const AppDataSource = new DataSource(
  createDatabaseOptions(path.join(__dirname, '..')),
);
