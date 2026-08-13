import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import type { AuthTokensDto } from '@/tenancy/dto/responses/auth-tokens.dto';
import type { TenantDto } from '@/tenancy/dto/responses/tenant.dto';
import { TenantRefreshToken } from '@/tenancy/entities/refresh-token.entity';
import { Tenant } from '@/tenancy/entities/tenant.entity';
import { TokenService } from '@/tenancy/services/token.service';
import * as passwordHasher from '@/tenancy/utils/password-hasher.util';

const REFRESH_TOKEN_TTL_DAYS = Number(
  process.env.JWT_REFRESH_TOKEN_TTL_DAYS ?? 7,
);
const MILLISECONDS_PER_DAY = 86_400_000;
const POSTGRES_UNIQUE_VIOLATION = '23505';

@Injectable()
export class TenantAuthService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantRefreshToken)
    private readonly refreshTokenRepository: Repository<TenantRefreshToken>,
    private readonly tokenService: TokenService,
  ) {}

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

  async login(email: string, password: string): Promise<AuthTokensDto> {
    const tenant = await this.tenantRepository.findOne({
      where: { email: normalizeEmail(email) },
    });

    // Deliberately the same error for "unknown email" and "wrong password" —
    // never reveal whether an email is registered (spec Edge Cases).
    if (
      !tenant ||
      !(await passwordHasher.verify(password, tenant.password_hash))
    ) {
      throw new UnauthorizedException('invalid email or password');
    }

    return this.issueTokens(tenant.id);
  }

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}
