import type { ApiKeyDto } from '@/tenancy/dto/responses/api-key.dto';
import type { ApiKey } from '@/tenancy/entities/api-key.entity';

export function mapApiKeyToDto(apiKey: ApiKey): ApiKeyDto {
  return {
    id: apiKey.id,
    key: apiKey.key_value,
    status: apiKey.status,
    created_at: apiKey.created_at.toISOString(),
  };
}
