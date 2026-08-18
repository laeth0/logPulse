import 'reflect-metadata';
import * as path from 'path';

import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

import { createDatabaseOptions } from '@/config/database.config';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const AppDataSource = new DataSource(
  createDatabaseOptions(path.join(__dirname, '..')),
);
