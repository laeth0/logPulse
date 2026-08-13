import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  LOADGEN_TENANT_EMAIL,
  LOADGEN_TENANT_ID,
  LOADGEN_TENANT_PASSWORD,
} from '@/common/constants/tenancy.constants';
import { ApiKey } from '@/tenancy/entities/api-key.entity';
import { Tenant } from '@/tenancy/entities/tenant.entity';
import * as passwordHasher from '@/tenancy/utils/password-hasher.util';

/**
 * Idempotently seeds LOADGEN_API_KEY at startup (spec FR-006/FR-007/FR-008;
 * research.md Decision 9). Runs as an OnApplicationBootstrap hook, which
 * completes before app.listen() opens the port — so this always finishes
 * before GET /health is reachable, with no change needed to HealthService.
 */
@Injectable()
export class LoadgenKeySeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(LoadgenKeySeeder.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const loadgenApiKey = process.env.LOADGEN_API_KEY;

    if (process.env.AUTH_ENABLED !== 'true' || !loadgenApiKey) {
      return;
    }

    // Lets an operator log in as the load-generator tenant via the normal
    // self-service flow (e.g. to inspect/manage its seeded key by hand) —
    // LOADGEN_TENANT_PASSWORD defaults to an insecure placeholder, matching
    // JWT_SECRET/DB_PASS's existing convention; override it for anything
    // beyond local development or grading.
    const passwordHash = await passwordHasher.hash(LOADGEN_TENANT_PASSWORD);

    await this.tenantRepository
      .createQueryBuilder()
      .insert()
      .values({
        id: LOADGEN_TENANT_ID,
        email: LOADGEN_TENANT_EMAIL,
        password_hash: passwordHash,
      })
      .orIgnore()
      .execute();

    await this.apiKeyRepository
      .createQueryBuilder()
      .insert()
      .values({
        tenant_id: LOADGEN_TENANT_ID,
        key_value: loadgenApiKey,
      })
      .orIgnore()
      .execute();

    this.logger.log('Seeded LOADGEN_API_KEY for the load-generator tenant');
  }
}
