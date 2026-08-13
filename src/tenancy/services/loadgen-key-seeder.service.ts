import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import type { Repository } from 'typeorm';

import {
  LOADGEN_TENANT_EMAIL,
  LOADGEN_TENANT_ID,
} from '@/common/constants/tenancy.constants';
import { ApiKey } from '@/tenancy/entities/api-key.entity';
import { Tenant } from '@/tenancy/entities/tenant.entity';

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

    // Never used to authenticate — the load-generator tenant only ever
    // authenticates via its seeded API key. This purely satisfies
    // tenants.password_hash's NOT NULL constraint with an unguessable value.
    const placeholderPasswordHash = randomBytes(32).toString('hex');

    await this.tenantRepository
      .createQueryBuilder()
      .insert()
      .values({
        id: LOADGEN_TENANT_ID,
        email: LOADGEN_TENANT_EMAIL,
        password_hash: placeholderPasswordHash,
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
