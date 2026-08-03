import { BadRequestException, Injectable } from '@nestjs/common';

import { MAX_FUTURE_TIMESTAMP_OFFSET_MS } from '@/common/constants/log-api.constants';
import { IngestLogsDto } from '@/logs/dto/requests/ingest-logs.dto';
import { LogEntryDto } from '@/logs/dto/requests/log-entry.dto';
import { RejectedLogDto } from '@/logs/dto/responses/ingest-logs-response.dto';
import { LogLevel } from '@/logs/enums/log-level.enum';
import type { LogAttributeValue } from '@/logs/interfaces/log-repository.interface';
import {
  isRecord,
  parseIsoTimestamp,
} from '@/logs/validators/log-validation.utils';

@Injectable()
export class LogEntryValidator {
  validateBatch(value: unknown): IngestLogsDto {
    if (!isRecord(value) || !Array.isArray(value.logs)) {
      throw new BadRequestException('request body must contain a logs array');
    }

    if (value.logs.length === 0) {
      throw new BadRequestException('logs must contain at least one entry');
    }

    const dto = new IngestLogsDto();
    dto.logs = value.logs;
    return dto;
  }

  validateEntry(value: unknown, index: number): LogEntryDto | RejectedLogDto {
    if (!isRecord(value)) {
      return this.reject(index, 'log entry must be an object');
    }

    if (typeof value.timestamp !== 'string') {
      return this.reject(index, 'timestamp must be a valid ISO 8601 timestamp');
    }

    const timestamp = parseIsoTimestamp(value.timestamp);
    if (!timestamp) {
      return this.reject(index, 'timestamp must be a valid ISO 8601 timestamp');
    }

    if (timestamp.getTime() > Date.now() + MAX_FUTURE_TIMESTAMP_OFFSET_MS) {
      return this.reject(
        index,
        'timestamp must not be more than five minutes in the future',
      );
    }

    if (!isLogLevel(value.level)) {
      return this.reject(index, `invalid level: '${String(value.level)}'`);
    }

    if (
      typeof value.service !== 'string' ||
      value.service.trim().length === 0
    ) {
      return this.reject(index, 'service must be a non-empty string');
    }

    if (
      typeof value.message !== 'string' ||
      value.message.trim().length === 0
    ) {
      return this.reject(index, 'message must be a non-empty string');
    }

    const attributes = this.validateAttributes(value.attributes);
    if (typeof attributes === 'string') {
      return this.reject(index, attributes);
    }

    const dto = new LogEntryDto();
    dto.timestamp = value.timestamp;
    dto.level = value.level;
    dto.service = value.service;
    dto.message = value.message;
    dto.attributes = attributes;
    return dto;
  }

  private validateAttributes(
    value: unknown,
  ): Record<string, LogAttributeValue> | string {
    if (value === undefined) {
      return {};
    }

    if (!isRecord(value)) {
      return 'attributes must be a flat object';
    }

    const attributes: Record<string, LogAttributeValue> = {};

    for (const [key, attributeValue] of Object.entries(value)) {
      if (!isAttributeValue(attributeValue)) {
        return `attribute '${key}' must be a string, number, or boolean`;
      }

      attributes[key] = attributeValue;
    }

    return attributes;
  }

  private reject(index: number, reason: string): RejectedLogDto {
    const rejection = new RejectedLogDto();
    rejection.index = index;
    rejection.reason = reason;
    return rejection;
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

function isAttributeValue(value: unknown): value is LogAttributeValue {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}
