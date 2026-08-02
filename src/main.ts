import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Global exception filter ──────────────────────────────────────────────
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ── Swagger / OpenAPI ────────────────────────────────────────────────────
  // Only expose the docs UI outside of production to avoid leaking the spec.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('logPulse')
      .setDescription(
        'A high-throughput log ingestion and query service. ' +
          'Ingests structured log entries, stores them in a time-partitioned ' +
          'PostgreSQL table, and exposes filtering, cursor pagination, and ' +
          'time-bucket aggregation endpoints.',
      )
      .setVersion('1.0')
      .addTag('logs', 'Log ingestion, querying, and aggregation')
      .addTag('health', 'Service health checks')
      .build();

    const document = SwaggerModule.createDocument(app, config);

    // UI  → http://localhost:<PORT>/api/docs
    // JSON → http://localhost:<PORT>/api/docs-json
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  const divider = '─'.repeat(52);
  console.log(`\n${divider}`);
  console.log(`🚀  App      → http://localhost:${port}/api`);
  console.log(`📖  Swagger  → http://localhost:${port}/api/docs`);
  console.log(`${divider}\n`);

}
bootstrap();
