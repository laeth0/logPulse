import { Injectable, PayloadTooLargeException } from '@nestjs/common';

import { LogEntryDto } from '@/logs/dto/requests/log-entry.dto';
import type {
  IngestLogsResponseDto,
  RejectedLogDto,
} from '@/logs/dto/responses/ingest-logs-response.dto';
import {
  IngestionBatchTooLargeError,
  IngestionCapacityExceededError,
} from '@/logs/errors/ingestion-capacity.errors';
import { BackpressureException } from '@/logs/exceptions/backpressure.exception';
import { mapLogEntryToNewLog } from '@/logs/mappers/log.mapper';
import { LogRepository } from '@/logs/repositories/log.repository';
import { LogEntryValidator } from '@/logs/validators/log-entry.validator';

@Injectable()
export class LogIngestionService {
  constructor(
    private readonly logRepository: LogRepository,
    private readonly logEntryValidator: LogEntryValidator,
  ) {}

  async ingest(
    value: unknown,
    tenantId: string,
  ): Promise<IngestLogsResponseDto> {
    const batch = this.logEntryValidator.validateBatch(value);
    const validLogs: LogEntryDto[] = [];
    const rejected: RejectedLogDto[] = [];

    batch.logs.forEach((entry, index) => {
      const result = this.logEntryValidator.validateEntry(entry, index);

      if (result instanceof LogEntryDto) {
        validLogs.push(result);
      } else {
        rejected.push(result);
      }
    });

    try {
      await this.logRepository.insertMany(
        validLogs.map((entry) => mapLogEntryToNewLog(entry, tenantId)),
      );
    } catch (error) {
      // Translation boundary between LogRepository's HTTP-agnostic domain
      // errors and the actual HTTP response (research.md Decision 8) — the
      // repository never throws these NestJS exceptions itself.
      if (error instanceof IngestionCapacityExceededError) {
        throw new BackpressureException(error.retryAfterSeconds);
      }

      if (error instanceof IngestionBatchTooLargeError) {
        throw new PayloadTooLargeException(error.message);
      }

      throw error;
    }

    return {
      accepted: validLogs.length,
      rejected,
    };
  }
}
