import { BadRequestException, Injectable } from '@nestjs/common';

import {
  ATTRIBUTE_QUERY_PREFIX,
  DEFAULT_LOG_QUERY_LIMIT,
  LOG_AGGREGATION_PARAMETER_NAMES,
  LOG_QUERY_PARAMETER_NAMES,
  MAX_LOG_QUERY_LIMIT,
  POSITIVE_INTEGER_PATTERN,
} from '@/common/constants/log-api.constants';
import { AggregateLogsDto } from '@/logs/dto/requests/aggregate-logs.dto';
import { QueryLogsDto } from '@/logs/dto/requests/query-logs.dto';
import { AggregationBucket } from '@/logs/enums/aggregation-bucket.enum';
import { AggregationGroup } from '@/logs/enums/aggregation-group.enum';
import { LogLevel } from '@/logs/enums/log-level.enum';
import {
  isRecord,
  parseIsoTimestamp,
} from '@/logs/validators/log-validation.utils';

@Injectable()
export class LogQueryValidator {
  validateQuery(value: unknown): QueryLogsDto {
    const query = this.validateParameters(value, LOG_QUERY_PARAMETER_NAMES);
    const dto = new QueryLogsDto();
    Object.assign(dto, this.parseFilters(query));
    dto.limit = this.parseLimit(query.limit);
    dto.cursor = this.parseOptionalString(query.cursor, 'cursor');
    return dto;
  }

  validateAggregation(value: unknown): AggregateLogsDto {
    const query = this.validateParameters(
      value,
      LOG_AGGREGATION_PARAMETER_NAMES,
    );
    const filters = this.parseFilters(query);

    if (!filters.since || !filters.until) {
      throw new BadRequestException('since and until are required');
    }

    if (!isAggregationBucket(query.bucket)) {
      throw new BadRequestException('bucket must be one of: 1m, 5m, 1h, 1d');
    }

    const dto = new AggregateLogsDto();
    Object.assign(dto, filters);
    dto.since = filters.since;
    dto.until = filters.until;
    dto.bucket = query.bucket;
    dto.groupBy = this.parseAggregationGroup(query.group_by);
    return dto;
  }

  private validateParameters(
    value: unknown,
    allowedParameters: readonly string[],
  ): Record<string, unknown> {
    if (!isRecord(value)) {
      throw new BadRequestException('query parameters must be an object');
    }

    for (const key of Object.keys(value)) {
      if (
        !allowedParameters.includes(key) &&
        !key.startsWith(ATTRIBUTE_QUERY_PREFIX)
      ) {
        throw new BadRequestException(`unsupported query parameter: '${key}'`);
      }
    }

    return value;
  }

  private parseFilters(query: Record<string, unknown>): QueryLogsDto {
    const dto = new QueryLogsDto();
    dto.service = this.parseOptionalString(query.service, 'service');
    dto.level = this.parseLogLevel(query.level);
    dto.since = this.parseOptionalTimestamp(query.since, 'since');
    dto.until = this.parseOptionalTimestamp(query.until, 'until');
    dto.attributes = this.parseAttributes(query);
    dto.q = this.parseOptionalString(query.q, 'q');

    if (dto.since && dto.until && dto.until.getTime() < dto.since.getTime()) {
      throw new BadRequestException('until must not be earlier than since');
    }

    return dto;
  }

  private parseAttributes(
    query: Record<string, unknown>,
  ): Record<string, string> {
    const attributes: Record<string, string> = {};

    for (const [key, value] of Object.entries(query)) {
      if (!key.startsWith(ATTRIBUTE_QUERY_PREFIX)) {
        continue;
      }

      const attributeKey = key.slice(ATTRIBUTE_QUERY_PREFIX.length);
      if (attributeKey.length === 0) {
        throw new BadRequestException('attribute filter key must not be empty');
      }

      attributes[attributeKey] = this.parseRequiredString(value, key);
    }

    return attributes;
  }

  private parseLimit(value: unknown): number {
    if (value === undefined) {
      return DEFAULT_LOG_QUERY_LIMIT;
    }

    const rawLimit = this.parseRequiredString(value, 'limit');
    if (!POSITIVE_INTEGER_PATTERN.test(rawLimit)) {
      throw new BadRequestException('limit must be a positive integer');
    }

    const limit = Number(rawLimit);
    if (limit < 1 || limit > MAX_LOG_QUERY_LIMIT) {
      throw new BadRequestException(
        `limit must be between 1 and ${MAX_LOG_QUERY_LIMIT}`,
      );
    }

    return limit;
  }

  private parseOptionalTimestamp(
    value: unknown,
    name: string,
  ): Date | undefined {
    if (value === undefined) {
      return undefined;
    }

    const timestamp = parseIsoTimestamp(this.parseRequiredString(value, name));
    if (!timestamp) {
      throw new BadRequestException(
        `${name} must be a valid ISO 8601 timestamp`,
      );
    }

    return timestamp;
  }

  private parseLogLevel(value: unknown): LogLevel | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!isLogLevel(value)) {
      throw new BadRequestException(
        'level must be one of: debug, info, warn, error',
      );
    }

    return value;
  }

  private parseAggregationGroup(value: unknown): AggregationGroup | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!isAggregationGroup(value)) {
      throw new BadRequestException('group_by must be service or level');
    }

    return value;
  }

  private parseOptionalString(
    value: unknown,
    name: string,
  ): string | undefined {
    return value === undefined
      ? undefined
      : this.parseRequiredString(value, name);
  }

  private parseRequiredString(value: unknown, name: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${name} must be a single string value`);
    }

    return value;
  }
}

function isLogLevel(value: unknown): value is LogLevel {
  return (
    value === LogLevel.DEBUG ||
    value === LogLevel.INFO ||
    value === LogLevel.WARN ||
    value === LogLevel.ERROR
  );
}

function isAggregationBucket(value: unknown): value is AggregationBucket {
  return (
    value === AggregationBucket.ONE_MINUTE ||
    value === AggregationBucket.FIVE_MINUTES ||
    value === AggregationBucket.ONE_HOUR ||
    value === AggregationBucket.ONE_DAY
  );
}

function isAggregationGroup(value: unknown): value is AggregationGroup {
  return value === AggregationGroup.SERVICE || value === AggregationGroup.LEVEL;
}
