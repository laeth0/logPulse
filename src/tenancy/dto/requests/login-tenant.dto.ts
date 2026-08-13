import { ApiProperty } from '@nestjs/swagger';

export class LoginTenantDto {
  @ApiProperty({ example: 'customer@example.com', format: 'email' })
  email: string;

  @ApiProperty({ example: 'at-least-8-characters' })
  password: string;
}
