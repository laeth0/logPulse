import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { parseWithSchema } from '@/common/validators/zod-validation.utils';
import { LoginTenantDto } from '@/tenancy/dto/requests/login-tenant.dto';
import { RefreshTokenDto } from '@/tenancy/dto/requests/refresh-token.dto';
import { RegisterTenantDto } from '@/tenancy/dto/requests/register-tenant.dto';
import { AuthTokensDto } from '@/tenancy/dto/responses/auth-tokens.dto';
import { TenantDto } from '@/tenancy/dto/responses/tenant.dto';
import { TenantAuthService } from '@/tenancy/services/tenant-auth.service';
import {
  loginTenantSchema,
  refreshTokenSchema,
  registerTenantSchema,
} from '@/tenancy/validators/tenant-auth.schema';

/**
 * No guards on any of these three — self-service Tenant account creation
 * and authentication are reachable regardless of AUTH_ENABLED (spec
 * Assumptions; research.md Decision 7).
 */
@ApiTags('tenancy')
@Controller('tenants')
export class TenantAuthController {
  constructor(private readonly tenantAuthService: TenantAuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Self-register a new Tenant account' })
  @ApiBody({ type: RegisterTenantDto })
  @ApiCreatedResponse({ type: TenantDto })
  @ApiBadRequestResponse({ description: 'Malformed request' })
  @ApiConflictResponse({ description: 'Email already registered' })
  register(@Body() body: unknown): Promise<TenantDto> {
    const { email, password } = parseWithSchema(registerTenantSchema, body);
    return this.tenantAuthService.register(email, password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in and receive an access + refresh token pair',
  })
  @ApiBody({ type: LoginTenantDto })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiBadRequestResponse({ description: 'Malformed request' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() body: unknown): Promise<AuthTokensDto> {
    const { email, password } = parseWithSchema(loginTenantSchema, body);
    return this.tenantAuthService.login(email, password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for a new access + refresh token pair',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiBadRequestResponse({ description: 'Malformed request' })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  refresh(@Body() body: unknown): Promise<AuthTokensDto> {
    const { refresh_token } = parseWithSchema(refreshTokenSchema, body);
    return this.tenantAuthService.refresh(refresh_token);
  }
}
