import { Injectable } from '@nestjs/common';

import { LogEntryDto } from '@/logs/dto/requests/log-entry.dto';
import type {
  IngestLogsResponseDto,
  RejectedLogDto,
} from '@/logs/dto/responses/ingest-logs-response.dto';
import { mapLogEntryToNewLog } from '@/logs/mappers/log.mapper';
import { LogRepository } from '@/logs/repositories/log.repository';
import { LogEntryValidator } from '@/logs/validators/log-entry.validator';

@Injectable()
export class LogIngestionService {
  constructor(
    private readonly logRepository: LogRepository,
    private readonly logEntryValidator: LogEntryValidator,
  ) {}

  async ingest(value: unknown): Promise<IngestLogsResponseDto> {
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

    await this.logRepository.insertMany(validLogs.map(mapLogEntryToNewLog));

    return {
      accepted: validLogs.length,
      rejected,
    };
  }
}
