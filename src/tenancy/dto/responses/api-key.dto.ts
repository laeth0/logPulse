import { ApiProperty } from '@nestjs/swagger';

import { ApiKeyStatus } from '@/tenancy/enums/api-key-status.enum';

export class ApiKeyDto {
  @ApiProperty({ example: '9c1e2f3a-1234-4a1b-9abc-1234567890ab' })
  id: string;

  @ApiProperty({
    example: 'lp_8fK2mNb7QxZ1oW5tR9cVjLpS3dGhYbA',
    description:
      'Full, usable secret — retrievable again later via GET /tenants/api-keys, not shown once.',
  })
  key: string;

  @ApiProperty({ enum: ApiKeyStatus, example: ApiKeyStatus.ACTIVE })
  status: ApiKeyStatus;

  @ApiProperty({ example: '2026-08-12T14:40:00.000Z', format: 'date-time' })
  created_at: string;
}
