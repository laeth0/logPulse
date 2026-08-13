import { Injectable } from '@nestjs/common';

import { CursorService } from '@/logs/cursor/cursor.service';
import type { QueryLogsResponseDto } from '@/logs/dto/responses/query-logs-response.dto';
import type { Log } from '@/logs/entities/log.entity';
import { mapLogToResponse } from '@/logs/mappers/log.mapper';
import { LogRepository } from '@/logs/repositories/log.repository';
import { LogQueryValidator } from '@/logs/validators/log-query.validator';

@Injectable()
export class LogQueryService {
  constructor(
    private readonly logRepository: LogRepository,
    private readonly cursorService: CursorService,
    private readonly logQueryValidator: LogQueryValidator,
  ) {}

  async query(value: unknown, tenantId: string): Promise<QueryLogsResponseDto> {
    const query = this.logQueryValidator.validateQuery(value);
    const cursor =
      query.cursor !== undefined
        ? this.cursorService.decode(query.cursor)
        : undefined;
    const page = await this.logRepository.findPage({
      tenantId,
      service: query.service,
      level: query.level,
      since: query.since,
      until: query.until,
      attributes: query.attributes,
      q: query.q,
      limit: query.limit,
      cursor,
    });

    return {
      logs: page.logs.map(mapLogToResponse),
      next_cursor: this.createNextCursor(page.logs, page.hasMore),
    };
  }

  private createNextCursor(logs: Log[], hasMore: boolean): string | null {
    const lastLog = logs.at(-1);
    if (!hasMore || !lastLog) {
      return null;
    }

    return this.cursorService.encode({
      timestamp: lastLog.timestamp.toISOString(),
      id: lastLog.id,
    });
  }
}
