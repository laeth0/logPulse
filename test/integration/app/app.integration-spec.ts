import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { createIntegrationApp } from '../support/create-integration-app';

describe('GET /', () => {
  let app: INestApplication | undefined;
  let httpServer: App;

  beforeAll(async () => {
    app = await createIntegrationApp();
    httpServer = app.getHttpServer() as App;
  }, 120_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns the application greeting', async () => {
    const response = await request(httpServer)
      .get('/')
      .expect('Content-Type', /text\/html/)
      .expect(200);

    expect(response.text).toBe('Hello World!');
  });
});
