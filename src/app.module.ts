import * as path from 'path';

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // ── Database ────────────────────────────────────────────────────────────
    // Registers the default DataSource globally so any module can inject it
    // via @InjectDataSource() without a forFeature() call.
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres' as const,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
        username: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME,
        entities: [path.join(__dirname, '**/*.entity{.ts,.js}')],
        migrations: [path.join(__dirname, 'migrations/*{.ts,.js}')],
        migrationsTableName: 'typeorm_migrations',
        synchronize: false,
        ssl:
          process.env.DB_SSL === 'true'
            ? { rejectUnauthorized: false }
            : false,
        logging: process.env.NODE_ENV === 'development',
      }),
    }),

    // ── Feature modules ──────────────────────────────────────────────────────
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
