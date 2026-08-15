import * as path from 'node:path';

import * as dotenv from 'dotenv';

const testEnvironmentPath = path.resolve(__dirname, '../../../.env.test');

const result = dotenv.config({ path: testEnvironmentPath, quiet: true });

if (result.error) {
  throw new Error(
    `Could not load the integration-test environment at ${testEnvironmentPath}: ${result.error.message}`,
  );
}

const databaseName = process.env.DB_NAME;

if (!databaseName || !/^[a-z][a-z0-9_]*_testing$/.test(databaseName)) {
  throw new Error(
    'Integration tests require DB_NAME to be a safe PostgreSQL identifier ending in `_testing`.',
  );
}

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Integration tests require NODE_ENV=test.');
}
