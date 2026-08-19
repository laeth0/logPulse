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

  /**
   * Resolves the associated tenant ID for a given active API key.
   *
   * @param value - The raw API key value presented by the caller.
   * @returns The tenant ID if the key is valid and active, or `undefined` otherwise.
   */
  async resolveActiveKey(value: string): Promise<string | undefined> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { key_value: value, status: ApiKeyStatus.ACTIVE },
      select: { tenant_id: true },
    });

    return apiKey?.tenant_id;
  }

  /**
   * Generates and persists a new API key for the specified tenant.
   *
   * @param tenantId - The unique identifier of the tenant.
   * @returns The newly created ApiKey entity.
   */
  create(tenantId: string): Promise<ApiKey> {
    return this.apiKeyRepository.save(
      this.apiKeyRepository.create({
        tenant_id: tenantId,
        key_value: apiKeyGenerator.generate(),
      }),
    );
  }

  /**
   * Lists all API keys belonging to a tenant, ordered by creation date descending.
   *
   * @param tenantId - The unique identifier of the tenant.
   * @returns An array of ApiKey entities.
   */
  listForTenant(tenantId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Revokes an existing API key for the specified tenant.
   * If the key is already revoked, this operation is idempotent and returns the entity.
   *
   * @param tenantId - The unique identifier of the tenant owning the key.
   * @param keyId - The unique identifier of the API key to revoke.
   * @throws {NotFoundException} If the key does not exist or does not belong to the tenant.
   * @returns The updated ApiKey entity with revoked status and timestamp.
   */
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
