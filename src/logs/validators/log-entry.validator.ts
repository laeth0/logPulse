import { Injectable } from '@nestjs/common';
import type { ZodIssue } from 'zod';

import { IngestLogsDto } from '@/logs/dto/requests/ingest-logs.dto';
import { LogEntryDto } from '@/logs/dto/requests/log-entry.dto';
import { RejectedLogDto } from '@/logs/dto/responses/ingest-logs-response.dto';
import {
  logBatchSchema,
  logEntrySchema,
} from '@/logs/validators/log-entry.schema';
import { parseWithSchema } from '@/logs/validators/zod-validation.utils';

@Injectable()
export class LogEntryValidator {
  validateBatch(value: unknown): IngestLogsDto {
    const batch = parseWithSchema(logBatchSchema, value);

    const dto = new IngestLogsDto();
    dto.logs = batch.logs;
    return dto;
  }

  validateEntry(value: unknown, index: number): LogEntryDto | RejectedLogDto {
    const result = logEntrySchema.safeParse(value);
    if (!result.success) {
      const issue = result.error.issues[0];
      const reason = issue
        ? this.formatRejectionReason(value, issue)
        : 'log entry must be an object';
      return this.reject(index, reason);
    }

    const dto = new LogEntryDto();
    dto.timestamp = result.data.timestamp;
    dto.level = result.data.level;
    dto.service = result.data.service;
    dto.message = result.data.message;
    dto.attributes = result.data.attributes;
    return dto;
  }

  private formatRejectionReason(value: unknown, issue: ZodIssue): string {
    if (issue.path[0] === 'level') {
      return `invalid level: '${String(readProperty(value, 'level'))}'`;
    }

    if (issue.path[0] === 'attributes') {
      const attributeKey = issue.path[1];
      return typeof attributeKey === 'string'
        ? `attribute '${attributeKey}' must be a string, number, or boolean`
        : 'attributes must be a flat object';
    }

    return issue.message;
  }

  private reject(index: number, reason: string): RejectedLogDto {
    const rejection = new RejectedLogDto();
    rejection.index = index;
    rejection.reason = reason;
    return rejection;
  }
}

function readProperty(value: unknown, property: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, property)
    : undefined;
}
