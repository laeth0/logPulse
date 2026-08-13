import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ApiKeysController } from '@/tenancy/controllers/api-keys.controller';
import { TenantAuthController } from '@/tenancy/controllers/tenant-auth.controller';
import { ApiKey } from '@/tenancy/entities/api-key.entity';
import { TenantRefreshToken } from '@/tenancy/entities/refresh-token.entity';
import { Tenant } from '@/tenancy/entities/tenant.entity';
import { ApiKeyAuthGuard } from '@/tenancy/guards/api-key-auth.guard';
import { TenantJwtAuthGuard } from '@/tenancy/guards/tenant-jwt-auth.guard';
import { ApiKeyService } from '@/tenancy/services/api-key.service';
import { LoadgenKeySeeder } from '@/tenancy/services/loadgen-key-seeder.service';
import { TenantAuthService } from '@/tenancy/services/tenant-auth.service';
import { TokenService } from '@/tenancy/services/token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, ApiKey, TenantRefreshToken]),
    JwtModule.register({ secret: process.env.JWT_SECRET }),
  ],
  controllers: [TenantAuthController, ApiKeysController],
  providers: [
    ApiKeyService,
    ApiKeyAuthGuard,
    LoadgenKeySeeder,
    TokenService,
    TenantAuthService,
    TenantJwtAuthGuard,
  ],
  // ApiKeyService must be exported alongside ApiKeyAuthGuard, not just the
  // guard itself: when @UseGuards(ApiKeyAuthGuard) is used from LogsModule,
  // Nest resolves the guard's own constructor dependencies (ApiKeyService)
  // against the consuming module's visibility, not TenancyModule's internal
  // scope — confirmed by a live UnknownDependenciesException without this.
  exports: [ApiKeyService, ApiKeyAuthGuard],
})
export class TenancyModule {}
