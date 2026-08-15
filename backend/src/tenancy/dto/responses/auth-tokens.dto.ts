import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensDto {
  @ApiProperty({ example: 'eyJhbGciOi...' })
  access_token: string;

  @ApiProperty({ example: 'eyJhbGciOi...' })
  refresh_token: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime, seconds' })
  expires_in: number;
}
