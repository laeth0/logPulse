import { ApiProperty } from '@nestjs/swagger';

export class TenantDto {
  @ApiProperty({ example: '3fa2b1c4-1234-4a1b-9abc-1234567890ab' })
  id: string;

  @ApiProperty({ example: 'customer@example.com' })
  email: string;
}
