import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { HealthService } from '@/health/health.service';
import type { HealthStatus } from '@/health/health.types';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Check service readiness',
    description:
      'Returns 200 when the database is reachable, migrations are applied, ' +
      'and the service is ready to accept logs.',
  })
  @ApiOkResponse({ description: 'The service is ready to accept logs.' })
  @ApiServiceUnavailableResponse({ description: 'The service is not ready.' })
  async check(): Promise<HealthStatus> {
    const health = await this.healthService.check();

    if (health.status === 'error') {
      throw new ServiceUnavailableException('Service is not ready');
    }

    return health;
  }
}
