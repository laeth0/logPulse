import { Injectable } from '@nestjs/common';

import type { AggregateLogsResponseDto } from '@/logs/dto/responses/aggregate-logs-response.dto';
import { mapAggregationToResponse } from '@/logs/mappers/log.mapper';
import { LogRepository } from '@/logs/repositories/log.repository';
import { LogQueryValidator } from '@/logs/validators/log-query.validator';

@Injectable()
export class LogAggregationService {
  constructor(
    private readonly logRepository: LogRepository,
    private readonly logQueryValidator: LogQueryValidator,
  ) {}

  /**
   * Validates query parameters and performs time-bucketed aggregation over logs for a tenant.
   *
   * @param value - The raw query object from the HTTP request.
   * @param tenantId - The authenticated tenant ID.
   * @returns A promise resolving to the aggregated buckets response DTO.
   */
  async aggregate(
    value: unknown,
    tenantId: string,
  ): Promise<AggregateLogsResponseDto> {
    const query = this.logQueryValidator.validateAggregation(value);
    const buckets = await this.logRepository.aggregate({
      tenantId,
      service: query.service,
      level: query.level,
      since: query.since,
      until: query.until,
      attributes: query.attributes,
      q: query.q,
      bucket: query.bucket,
      groupBy: query.groupBy,
    });

    return { buckets: buckets.map(mapAggregationToResponse) };
  }
}
