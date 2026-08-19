import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { isUniqueViolation } from '@/common/utils/postgres.utils';
import { normalizeEmail } from '@/tenancy/utils/email.util';
import { MILLISECONDS_PER_DAY } from '@/common/constants/retention.constants';
import { REFRESH_TOKEN_TTL_DAYS } from '@/common/constants/tenancy.constants';
import type { AuthTokensDto } from '@/tenancy/dto/responses/auth-tokens.dto';
import type { TenantDto } from '@/tenancy/dto/responses/tenant.dto';
import { TenantRefreshToken } from '@/tenancy/entities/refresh-token.entity';
import { Tenant } from '@/tenancy/entities/tenant.entity';
import { TokenService } from '@/tenancy/services/token.service';
import * as passwordHasher from '@/tenancy/utils/password-hasher.util';

@Injectable()
export class TenantAuthService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantRefreshToken)
    private readonly refreshTokenRepository: Repository<TenantRefreshToken>,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Registers a new tenant account with normalized email and hashed password.
   *
   * @param email - The tenant's email address.
   * @param password - The plaintext password to hash and store.
   * @throws {ConflictException} If the email is already registered.
   * @returns The newly created tenant's basic profile.
   */
  async register(email: string, password: string): Promise<TenantDto> {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await passwordHasher.hash(password);

    try {
      const tenant = await this.tenantRepository.save(
        this.tenantRepository.create({
          email: normalizedEmail,
          password_hash: passwordHash,
        }),
      );

      return {
        id: tenant.id,
        email: tenant.email,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('email is already registered');
      }

      throw error;
    }
  }

  /**
   * Authenticates a tenant using email and password, returning an access and refresh token pair.
   *
   * @param email - The tenant's registered email address.
   * @param password - The plaintext password to verify.
   * @throws {UnauthorizedException} If the credentials are invalid.
   * @returns An object containing access and refresh tokens.
   */
  async login(email: string, password: string): Promise<AuthTokensDto> {
    const tenant = await this.tenantRepository.findOne({
      where: { email: normalizeEmail(email) },
    });

    if (
      !tenant ||
      !(await passwordHasher.verify(password, tenant.password_hash))
    ) {
      throw new UnauthorizedException('invalid email or password');
    }

    return this.issueTokens(tenant.id);
  }

  /**
   * Rotates and validates a refresh token, revoking the old one and issuing a new token pair.
   *
   * @param providedRefreshToken - The plaintext refresh token presented by the tenant.
   * @throws {UnauthorizedException} If the refresh token is invalid, expired, or revoked.
   * @returns A new pair of access and refresh tokens.
   */
  async refresh(providedRefreshToken: string): Promise<AuthTokensDto> {
    const tenantId =
      await this.tokenService.verifyRefreshToken(providedRefreshToken);

    const candidates = await this.refreshTokenRepository.find({
      where: { tenant_id: tenantId, revoked_at: IsNull() },
    });

    const now = new Date();
    let matched: TenantRefreshToken | undefined;

    for (const candidate of candidates) {
      if (
        candidate.expires_at > now &&
        (await passwordHasher.verify(
          providedRefreshToken,
          candidate.token_hash,
        ))
      ) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      throw new UnauthorizedException('invalid or expired refresh token');
    }

    matched.revoked_at = now;
    await this.refreshTokenRepository.save(matched);

    return this.issueTokens(tenantId);
  }

  /**
   * Generates a new access token and hashed refresh token for the specified tenant.
   *
   * @param tenantId - The unique identifier of the tenant.
   * @returns The issued AuthTokensDto containing both tokens and metadata.
   */
  private async issueTokens(tenantId: string): Promise<AuthTokensDto> {
    const [accessToken, refreshToken] = await Promise.all([
      this.tokenService.signAccessToken(tenantId),
      this.tokenService.signRefreshToken(tenantId),
    ]);

    const refreshTokenHash = await passwordHasher.hash(refreshToken);

    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        tenant_id: tenantId,
        token_hash: refreshTokenHash,
        expires_at: new Date(
          Date.now() + REFRESH_TOKEN_TTL_DAYS * MILLISECONDS_PER_DAY,
        ),
      }),
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.tokenService.accessTokenTtlSeconds,
    };
  }
}
