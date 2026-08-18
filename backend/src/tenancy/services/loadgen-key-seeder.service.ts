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
