import { ApiProperty } from '@nestjs/swagger';

import { ApiKeyDto } from '@/tenancy/dto/responses/api-key.dto';

export class ApiKeyListDto {
  @ApiProperty({ type: [ApiKeyDto] })
  api_keys: ApiKeyDto[];
}
