import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService, HealthStatus } from './health.service';

/**
 * Exposes the GET /health endpoint required by the project specification.
 *
 * The load generator polls this endpoint before starting any load test.
 * It returns:
 *  - HTTP 200 when the database is connected and all migrations are applied.
 *  - HTTP 503 when any dependency check fails.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Service health check',
    description:
      'Returns 200 once the database connection is established and all ' +
      'migrations have been applied. The load generator polls this endpoint ' +
      'before sending traffic.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy and ready to accept logs.',
  })
  @ApiResponse({
    status: 503,
    description: 'Service is not ready — database disconnected or migrations pending.',
  })
  async check(): Promise<HealthStatus> {
    const health = await this.healthService.check();

    if (health.status !== 'ok') {
      throw new ServiceUnavailableException( 
        `Service not ready: database=${health.database}, migrations=${health.migrations}`,
      );
    }

    return health;
  }
}
