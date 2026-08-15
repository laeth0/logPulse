import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from '@/app.module';
import { DEFAULT_JSON_BODY_LIMIT } from '@/common/constants/http.constants';
import { GlobalExceptionFilter } from '@/common/filters/global-exception.filter';

export async function createIntegrationApp(): Promise<
  INestApplication & NestExpressApplication
> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();

  app.useBodyParser('json', {
    limit: process.env.JSON_BODY_LIMIT ?? DEFAULT_JSON_BODY_LIMIT,
  });
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.init();
  return app;
}
