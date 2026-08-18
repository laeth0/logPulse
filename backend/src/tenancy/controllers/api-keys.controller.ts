import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { parseWithSchema } from '@/common/validators/zod-validation.utils';
import { CurrentTenantId } from '@/tenancy/decorators/current-tenant-id.decorator';
import { ApiKeyListDto } from '@/tenancy/dto/responses/api-key-list.dto';
import { ApiKeyDto } from '@/tenancy/dto/responses/api-key.dto';
import type { ApiKey } from '@/tenancy/entities/api-key.entity';
import { ApiKeyStatus } from '@/tenancy/enums/api-key-status.enum';
import { TenantJwtAuthGuard } from '@/tenancy/guards/tenant-jwt-auth.guard';
import { ApiKeyService } from '@/tenancy/services/api-key.service';
import { createApiKeySchema } from '@/tenancy/validators/api-key.schema';

@ApiTags('tenancy')
@Controller('tenants/api-keys')
@UseGuards(TenantJwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({
    summary: "Create a new API key for the authenticated Tenant's own account",
  })
  @ApiCreatedResponse({ type: ApiKeyDto })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid/expired access token',
  })
  @ApiForbiddenResponse({
    description: 'An API key was presented instead of a Tenant access token',
  })
  async create(
    @Body() body: unknown,
    @CurrentTenantId() tenantId: string,
  ): Promise<ApiKeyDto> {
    parseWithSchema(createApiKeySchema, body);
    const apiKey = await this.apiKeyService.create(tenantId);
    return mapApiKeyToDto(apiKey);
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated Tenant's own API keys" })
  @ApiOkResponse({ type: ApiKeyListDto })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid/expired access token',
  })
  @ApiForbiddenResponse({
    description: 'An API key was presented instead of a Tenant access token',
  })
  async list(@CurrentTenantId() tenantId: string): Promise<ApiKeyListDto> {
    const apiKeys = await this.apiKeyService.listForTenant(tenantId);
    return { api_keys: apiKeys.map(mapApiKeyToDto) };
  }

  @Delete(':id')
  @ApiOperation({
    summary: "Revoke one of the authenticated Tenant's own API keys",
  })
  @ApiOkResponse({ description: 'Revoked (idempotent if already revoked)' })
  @ApiUnauthorizedResponse({
    description: 'Missing/invalid/expired access token',
  })
  @ApiForbiddenResponse({
    description: 'An API key was presented instead of a Tenant access token',
  })
  @ApiNotFoundResponse({
    description: 'The key does not exist, or belongs to a different Tenant',
  })
  async revoke(
    @Param('id') id: string,
    @CurrentTenantId() tenantId: string,
  ): Promise<{ id: string; status: ApiKeyStatus }> {
    const apiKey = await this.apiKeyService.revoke(tenantId, id);
    return { id: apiKey.id, status: apiKey.status };
  }
}

function mapApiKeyToDto(apiKey: ApiKey): ApiKeyDto {
  return {
    id: apiKey.id,
    key: apiKey.key_value,
    status: apiKey.status,
    created_at: apiKey.created_at.toISOString(),
  };
}
