import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { ApiKey } from '@/tenancy/entities/api-key.entity';
import { ApiKeyStatus } from '@/tenancy/enums/api-key-status.enum';
import * as apiKeyGenerator from '@/tenancy/utils/api-key-generator.util';

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  async resolveActiveKey(value: string): Promise<string | undefined> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { key_value: value, status: ApiKeyStatus.ACTIVE },
      select: { tenant_id: true },
    });

    return apiKey?.tenant_id;
  }

  create(tenantId: string): Promise<ApiKey> {
    return this.apiKeyRepository.save(
      this.apiKeyRepository.create({
        tenant_id: tenantId,
        key_value: apiKeyGenerator.generate(),
      }),
    );
  }

  listForTenant(tenantId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
    });
  }

  async revoke(tenantId: string, keyId: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id: keyId, tenant_id: tenantId },
    });

    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }

    if (apiKey.status === ApiKeyStatus.REVOKED) {
      return apiKey;
    }

    apiKey.status = ApiKeyStatus.REVOKED;
    apiKey.revoked_at = new Date();

    return this.apiKeyRepository.save(apiKey);
  }
}
